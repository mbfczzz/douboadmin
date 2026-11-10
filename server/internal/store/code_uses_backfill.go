package store

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
)

// Deployment migration only: reconstruct existing usages from registration
// snapshots and their audit trail. Re-running is safe, including after a
// partial migration; a later decision never reverts to a pending snapshot.
func BackfillCodeUses(ctx context.Context, s Store) error {
	for _, namespace := range []string{"partner_audit", "registrations"} {
		q := core.RecordQuery{Namespace: namespace, Page: 1, Size: 100, ByID: true}
		if namespace == "partner_audit" {
			q.FieldsIn = map[string][]string{"kind": {"register", "registration_approved", "registration_rejected"}}
		}
		for {
			page, e := s.RecordPage(ctx, q)
			if e != nil {
				return e
			}
			for _, row := range page.Items {
				var reg core.Registration
				user := row.ID
				if namespace == "partner_audit" {
					var event struct {
						Data core.Registration `json:"data"`
					}
					if e = json.Unmarshal(row.Data, &event); e != nil {
						return e
					}
					reg, user = event.Data, row.Owner
				} else if e = json.Unmarshal(row.Data, &reg); e != nil {
					return e
				}
				if reg.RegisteredAt.IsZero() {
					reg.RegisteredAt = row.CreatedAt
				}
				if e = backfillCodeUse(ctx, s, user, reg); e != nil {
					return e
				}
			}
			if len(page.Items) < q.Size {
				break
			}
			q.AfterID = page.Items[len(page.Items)-1].ID
		}
	}
	return backfillUnboundCodes(ctx, s)
}

func backfillCodeUse(ctx context.Context, s Store, user string, reg core.Registration) error {
	if user == "" || reg.Code == "" || (reg.Status != "pending" && reg.Status != "approved" && reg.Status != "rejected") {
		return nil
	}
	id := core.CodeUseID(user, reg.Code)
	row, e := s.Get(ctx, "code_uses", id)
	var old core.CodeUse
	if errors.Is(e, core.ErrNotFound) {
		code, err := s.Get(ctx, "share_codes", reg.Code)
		if errors.Is(err, core.ErrNotFound) {
			return nil
		} // cannot invent an issuer
		if err != nil {
			return err
		}
		var share core.ShareCode
		if err = json.Unmarshal(code.Data, &share); err != nil {
			return err
		}
		row, e = core.Record{ID: id, Owner: share.PartnerID, CreatedAt: reg.RegisteredAt}, nil
	} else if e == nil {
		e = json.Unmarshal(row.Data, &old)
	}
	if e != nil {
		return e
	}
	use := core.CodeUseFromRegistration(user, old.Nickname, reg)
	if use.RegisteredAt.Before(old.RegisteredAt) {
		return nil
	}
	if use.RegisteredAt.Equal(old.RegisteredAt) {
		if old.DecidedAt != nil && (use.DecidedAt == nil || !use.DecidedAt.After(*old.DecidedAt)) {
			return nil
		}
		if old.Status != "pending" && old.Status != "" && use.Status == "pending" {
			return nil
		}
	}
	if use.Nickname == "" {
		if profile, err := s.Get(ctx, "users", user); err == nil {
			var p struct {
				Nickname string `json:"nickname"`
			}
			if json.Unmarshal(profile.Data, &p) == nil {
				use.Nickname = p.Nickname
			}
		}
	}
	data := core.Data(use)
	if row.Version > 0 && bytes.Equal(core.Data(old), data) {
		return nil
	}
	row.Data = data
	_, e = s.Put(ctx, "code_uses", row, row.Version)
	return e
}
