package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/passwordpolicy"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// SyncInitialAdmin applies ADMIN_USER / ADMIN_PASSWORD when the API starts.
// Only the configured account is touched. Password changes use the same
// session version as an administrator reset; unchanged passwords are a no-op.
func (a *Server) SyncInitialAdmin(ctx context.Context) (changed bool, err error) {
	username, password := strings.TrimSpace(a.Config.AdminUser), a.Config.AdminPassword
	if !adminUsername.MatchString(username) {
		return false, fmt.Errorf("ADMIN_USER 必须为 3–32 位英文字母、数字、点、横线或下划线")
	}
	if err := passwordpolicy.Validate(password); err != nil {
		return false, fmt.Errorf("ADMIN_PASSWORD: %w", err)
	}
	id := adminID(username)
	err = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		// Serialize simultaneous API startups, including the missing-account
		// case, then lock the account against concurrent console updates.
		if _, err := tx.Lock("settings_control", core.Record{ID: "initial-admin:" + id, Data: core.Data(map[string]string{})}); err != nil {
			return err
		}
		row, err := tx.Lock("admin_accounts", core.Record{ID: id})
		if errors.Is(err, core.ErrNotFound) {
			hash, err := hashPassword(password)
			if err != nil {
				return err
			}
			account := core.AdminAccount{Username: username, Name: "超级管理员", Role: core.SuperAdminRole, PasswordHash: hash, PasswordChangedAt: time.Now().UTC(), CreatedBy: "bootstrap"}
			_, err = tx.Put("admin_accounts", core.Record{ID: id, Data: core.Data(account)}, 0)
			changed = err == nil
			return err
		}
		if err != nil {
			return err
		}
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) != nil {
			return errors.New("初始管理员账号数据异常")
		}
		if !strings.EqualFold(strings.TrimSpace(account.Username), username) {
			return errors.New("初始管理员账号标识与 ADMIN_USER 不一致，请检查数据库账号数据")
		}
		if account.Role != core.SuperAdminRole || account.PartnerID != "" {
			return errors.New("ADMIN_USER 与现有非平台超级管理员账号冲突，请检查配置")
		}
		if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(password)) == nil {
			return nil
		}
		hash, err := hashPassword(password)
		if err != nil {
			return err
		}
		account.PasswordHash, account.PasswordChangedAt = hash, time.Now().UTC()
		row.Data = core.Data(account)
		_, err = tx.Put("admin_accounts", row, row.Version)
		changed = err == nil
		return err
	})
	return changed && err == nil, err
}
