package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"doubo/server/internal/core"
)

type providerLogin struct {
	Sealed    string    `json:"sealed"`
	ChangedAt time.Time `json:"changedAt"`
}

// Admin-managed and mini-program-generated passwords have separate records
// and encryption purposes. An admin reset must not reveal its new password
// in the mini-program; neither view ever returns an outdated credential.
func (a *Server) saveAdminPassword(ctx context.Context, partner, password string, changed time.Time) {
	a.saveLoginPassword(ctx, "admin:"+partner, partner, password, changed)
}

func (a *Server) savePassword(r *http.Request, partner, password string, changed time.Time) {
	a.saveLoginPassword(r.Context(), partner, partner, password, changed)
}

func (a *Server) saveLoginPassword(ctx context.Context, id, partner, password string, changed time.Time) {
	if a.Integrations == nil {
		return
	}
	sealed, e := a.Integrations.SealSecret("provider-login/"+id, password)
	if e == nil {
		row, err := a.Store.Get(ctx, "provider_logins", id)
		if errors.Is(err, core.ErrNotFound) {
			row, err = core.Record{ID: id, Owner: partner}, nil
		}
		if err == nil {
			row.Data = core.Data(providerLogin{Sealed: sealed, ChangedAt: changed})
			_, e = a.Store.Put(ctx, "provider_logins", row, row.Version)
		} else {
			e = err
		}
	}
	if e != nil {
		slog.Warn("saving provider password failed", "error", e)
	}
}

func (a *Server) savedPassword(r *http.Request, partner string, account core.AdminAccount) (string, bool) {
	return a.savedLoginPassword(r.Context(), partner, account)
}

func (a *Server) adminPassword(ctx context.Context, partner string, account core.AdminAccount) (string, bool) {
	if password, ok := a.savedLoginPassword(ctx, "admin:"+partner, account); ok {
		return password, true
	}
	return a.savedLoginPassword(ctx, partner, account)
}

func (a *Server) savedLoginPassword(ctx context.Context, id string, account core.AdminAccount) (string, bool) {
	if a.Integrations == nil {
		return "", false
	}
	row, e := a.Store.Get(ctx, "provider_logins", id)
	var v providerLogin
	if e != nil || json.Unmarshal(row.Data, &v) != nil || !v.ChangedAt.Equal(account.PasswordChangedAt) {
		return "", false
	}
	password, e := a.Integrations.OpenSecret("provider-login/"+id, v.Sealed)
	return password, e == nil && password != ""
}
