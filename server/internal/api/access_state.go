package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
)

func (a *Server) userDisabled(ctx context.Context, id string) (bool, error) {
	row, e := a.Store.Get(ctx, "users", id)
	if e != nil {
		return false, e
	}
	var profile *struct {
		Disabled bool `json:"disabled"`
		Archived bool `json:"archived"`
	}
	if json.Unmarshal(row.Data, &profile) != nil || profile == nil {
		return false, fmt.Errorf("账号状态异常")
	}
	return profile.Disabled || profile.Archived, nil
}

// Authorization must not depend on presentJob's best-effort display enrichment.
func (a *Server) checkShareAccess(ctx context.Context, j core.Job) error {
	if j.Status != "succeeded" || !core.IsWork(j.Input.Kind) {
		return core.ErrNotFound
	}
	row, e := a.Store.Get(ctx, "work_meta", j.ID)
	if e == nil {
		var meta *core.WorkMeta
		if json.Unmarshal(row.Data, &meta) != nil || meta == nil {
			return fmt.Errorf("作品状态异常")
		}
		if meta.Deleted {
			return core.ErrNotFound
		}
	} else if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	row, e = a.Store.Get(ctx, "reviews", j.ID)
	if errors.Is(e, core.ErrNotFound) {
		return core.ErrConflict
	}
	if e != nil {
		return e
	}
	var review core.Review
	if e = json.Unmarshal(row.Data, &review); e != nil {
		return e
	}
	if review.Status != "approved" {
		return core.ErrConflict
	}
	disabled, e := a.userDisabled(ctx, j.UserID)
	if e != nil {
		return e
	}
	if disabled {
		return core.ErrNotFound
	}
	if a.Config.RequireActivation {
		access, e := a.Partners.Access(ctx, j.UserID)
		if e != nil {
			return e
		}
		if !access.Active {
			return core.ErrNotFound
		}
	}
	return nil
}
