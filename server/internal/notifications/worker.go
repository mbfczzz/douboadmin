package notifications

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"log/slog"
	"time"
)

func (s *Sender) Run(ctx context.Context) {
	if !s.Ready() {
		return
	}
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.deliver(ctx)
		}
	}
}
func (s *Sender) deliver(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows, e := s.Store.PendingSubscriptions(ctx, s.after, 20)
	if e == nil && len(rows) == 0 && s.after != "" {
		s.after = ""
		rows, e = s.Store.PendingSubscriptions(ctx, "", 20)
	}
	if e != nil {
		return
	}
	for _, row := range rows {
		if ctx.Err() != nil {
			return
		}
		s.after = row.ID
		if time.Since(row.CreatedAt) > 24*time.Hour {
			continue
		}
		var n core.Notification
		if json.Unmarshal(row.Data, &n) != nil || n.Kind != "job" || n.Title != "作品已完成" {
			continue
		}
		pref, e := s.Store.Get(ctx, "preferences", row.Owner)
		if e != nil {
			continue
		}
		var prefs core.UserPreferences
		if json.Unmarshal(pref.Data, &prefs) != nil || !prefs.CompletionSubscription {
			continue
		}
		identity, e := s.Store.Get(ctx, "wechat_identities", row.Owner)
		if e != nil {
			continue
		}
		var user struct {
			OpenID string `json:"openid"`
		}
		_ = json.Unmarshal(identity.Data, &user)
		if user.OpenID == "" {
			continue
		}
		if _, e = s.Store.Get(ctx, "subscription_delivery", row.ID); e == nil {
			continue
		}
		// A token lookup cannot deliver a message, so its failure remains safe to retry.
		attempt, cancel := context.WithTimeout(ctx, 15*time.Second)
		token, e := s.token(attempt)
		cancel()
		if e != nil {
			continue
		}
		// Persist the send intent before contacting WeChat; unknown outcomes are not blindly resent.
		delivery, e := s.Store.Put(ctx, "subscription_delivery", core.Record{ID: row.ID, Owner: row.Owner, Data: core.Data(map[string]string{"status": "sending"})}, 0)
		if e != nil {
			continue
		}
		attempt, cancel = context.WithTimeout(ctx, 15*time.Second)
		e = s.send(attempt, token, user.OpenID, n)
		cancel()
		status := "sent"
		message := ""
		if e != nil {
			status = "not_confirmed"
			message = e.Error()
			slog.Warn("subscription delivery not confirmed", "notification", row.ID, "error", message)
		}
		delivery.Data = core.Data(map[string]string{"status": status, "message": message})
		_, _ = s.Store.Put(ctx, "subscription_delivery", delivery, delivery.Version)
	}
}
