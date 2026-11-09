package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
)

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
	// Works are shareable once finished; there is no content review step.
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
