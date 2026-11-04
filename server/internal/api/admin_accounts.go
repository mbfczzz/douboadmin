package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var adminUsername = regexp.MustCompile(`^[A-Za-z0-9._-]{3,32}$`)

func adminID(username string) string {
	return core.Digest("admin:" + strings.ToLower(strings.TrimSpace(username)))[:32]
}

func validAdminRole(role string) bool { return role == "super_admin" || role == "operator" }

func hashPassword(password string) (string, error) {
	if len([]rune(password)) < 16 || len([]rune(password)) > 128 {
		return "", errors.New("密码长度需为 16–128 个字符")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

func adminView(row core.Record) core.Record {
	var account core.AdminAccount
	if json.Unmarshal(row.Data, &account) == nil {
		account.PasswordHash = ""
		row.Data = core.Data(account)
	}
	return row
}

func (a *Server) bootstrapAdmin(r *http.Request, username, password string) (core.Record, core.AdminAccount, error) {
	if username != a.Config.AdminUser || password != a.Config.AdminPassword {
		return core.Record{}, core.AdminAccount{}, core.ErrNotFound
	}
	hashBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return core.Record{}, core.AdminAccount{}, err
	}
	hash := string(hashBytes)
	now := time.Now().UTC()
	account := core.AdminAccount{Username: username, Name: "超级管理员", Role: "super_admin", PasswordHash: hash, PasswordChangedAt: now, CreatedBy: "bootstrap"}
	row, err := a.Store.Put(r.Context(), "admin_accounts", core.Record{ID: adminID(username), Data: core.Data(account)}, 0)
	if errors.Is(err, core.ErrConflict) {
		return a.readAdmin(r, username)
	}
	return row, account, err
}

func (a *Server) readAdmin(r *http.Request, username string) (core.Record, core.AdminAccount, error) {
	row, err := a.Store.Get(r.Context(), "admin_accounts", adminID(username))
	var account core.AdminAccount
	if err == nil {
		err = json.Unmarshal(row.Data, &account)
	}
	return row, account, err
}

func (a *Server) adminAccounts(w http.ResponseWriter, r *http.Request) {
	rows, err := a.Store.List(r.Context(), "admin_accounts", "")
	if err != nil {
		dbError(w, err)
		return
	}
	for i := range rows {
		rows[i] = adminView(rows[i])
	}
	role := identity(r).AdminRole
	reply(w, 200, map[string]any{"items": rows, "canManage": role == "" || role == "super_admin"})
}

func (a *Server) createAdminAccount(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Name     string `json:"name"`
		Phone    string `json:"phone"`
		Role     string `json:"role"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Username, input.Name, input.Phone = strings.TrimSpace(input.Username), strings.TrimSpace(input.Name), strings.TrimSpace(input.Phone)
	if !adminUsername.MatchString(input.Username) || input.Name == "" || len([]rune(input.Name)) > 50 || (input.Phone != "" && !validPhone.MatchString(input.Phone)) || !validAdminRole(input.Role) {
		fail(w, 400, "管理账号资料无效")
		return
	}
	hash, err := hashPassword(input.Password)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	now := time.Now().UTC()
	account := core.AdminAccount{Username: input.Username, Name: input.Name, Phone: input.Phone, Role: input.Role, PasswordHash: hash, PasswordChangedAt: now, CreatedBy: identity(r).ID}
	row, err := a.Store.Put(r.Context(), "admin_accounts", core.Record{ID: adminID(input.Username), Data: core.Data(account)}, 0)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 201, adminView(row))
}

func (a *Server) updateAdminAccount(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version  int64  `json:"version"`
		Name     string `json:"name"`
		Phone    string `json:"phone"`
		Role     string `json:"role"`
		Disabled bool   `json:"disabled"`
	}
	if !decode(w, r, &input) {
		return
	}
	row, err := a.Store.Get(r.Context(), "admin_accounts", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	var account core.AdminAccount
	if json.Unmarshal(row.Data, &account) != nil {
		fail(w, 500, "管理账号数据异常")
		return
	}
	input.Name, input.Phone = strings.TrimSpace(input.Name), strings.TrimSpace(input.Phone)
	if input.Name == "" || len([]rune(input.Name)) > 50 || (input.Phone != "" && !validPhone.MatchString(input.Phone)) || !validAdminRole(input.Role) {
		fail(w, 400, "管理账号资料无效")
		return
	}
	if row.ID == identity(r).ID && (input.Disabled || input.Role != "super_admin") {
		fail(w, 409, "不能停用或降级当前登录账号")
		return
	}
	if err = a.keepSuperAdmin(r.Context(), row.ID, account, input.Role, input.Disabled, false); err != nil {
		fail(w, 409, err.Error())
		return
	}
	account.Name, account.Phone, account.Role, account.Disabled = input.Name, input.Phone, input.Role, input.Disabled
	row.Data = core.Data(account)
	row, err = a.Store.Put(r.Context(), "admin_accounts", row, input.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, adminView(row))
}

func (a *Server) resetAdminPassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version  int64  `json:"version"`
		Password string `json:"password"`
	}
	if !decode(w, r, &input) {
		return
	}
	hash, err := hashPassword(input.Password)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	row, err := a.Store.Get(r.Context(), "admin_accounts", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	var account core.AdminAccount
	if json.Unmarshal(row.Data, &account) != nil {
		fail(w, 500, "管理账号数据异常")
		return
	}
	account.PasswordHash, account.PasswordChangedAt = hash, time.Now().UTC()
	row.Data = core.Data(account)
	row, err = a.Store.Put(r.Context(), "admin_accounts", row, input.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, adminView(row))
}

func (a *Server) archiveAdminAccount(w http.ResponseWriter, r *http.Request) {
	if r.PathValue("id") == identity(r).ID {
		fail(w, 409, "不能归档当前登录账号")
		return
	}
	var input struct {
		Version int64 `json:"version"`
	}
	if !decode(w, r, &input) {
		return
	}
	row, err := a.Store.Get(r.Context(), "admin_accounts", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	var account core.AdminAccount
	if json.Unmarshal(row.Data, &account) != nil {
		fail(w, 500, "管理账号数据异常")
		return
	}
	if err = a.keepSuperAdmin(r.Context(), row.ID, account, account.Role, true, true); err != nil {
		fail(w, 409, err.Error())
		return
	}
	account.Disabled, account.Archived = true, true
	row.Data = core.Data(account)
	if _, err = a.Store.Put(r.Context(), "admin_accounts", row, input.Version); err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}

func requireSuperAdmin(w http.ResponseWriter, r *http.Request) bool {
	role := identity(r).AdminRole
	if role == "" || role == "super_admin" {
		return true
	}
	fail(w, 403, "仅超级管理员可管理后台账号")
	return false
}

func (a *Server) superAdmin(h http.HandlerFunc) http.HandlerFunc {
	return a.auth("admin", func(w http.ResponseWriter, r *http.Request) {
		if requireSuperAdmin(w, r) {
			h(w, r)
		}
	})
}
