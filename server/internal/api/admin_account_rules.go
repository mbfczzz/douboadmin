package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
)

func (a *Server) keepSuperAdmin(ctx context.Context, id string, current core.AdminAccount, nextRole string, disabled, archived bool) error {
	if current.Role != "super_admin" || (nextRole == "super_admin" && !disabled && !archived) {
		return nil
	}
	rows, err := a.Store.List(ctx, "admin_accounts", "")
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.ID == id {
			continue
		}
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) == nil && account.Role == "super_admin" && !account.Disabled && !account.Archived {
			return nil
		}
	}
	return errors.New("至少保留一个启用的超级管理员")
}
