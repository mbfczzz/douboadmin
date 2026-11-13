package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
)

const rolesNamespace = "admin_roles"

// adminRole resolves a role id; stored records override builtin names and menus.
func (a *Server) adminRole(ctx context.Context, id string) (core.AdminRole, bool, error) {
	builtin := core.BuiltinAdminRoles()
	if id == core.SuperAdminRole {
		return builtin[id], true, nil
	}
	row, err := a.Store.Get(ctx, rolesNamespace, id)
	if errors.Is(err, core.ErrNotFound) {
		role, ok := builtin[id]
		return role, ok, nil
	}
	if err != nil {
		return core.AdminRole{}, false, err
	}
	var role core.AdminRole
	if json.Unmarshal(row.Data, &role) != nil || role.Deleted {
		return core.AdminRole{}, false, nil
	}
	if b, ok := builtin[id]; ok {
		role.Scope, role.System = b.Scope, true
		if b.Scope == core.RoleScopeUser {
			role.Menus = []string{}
		}
	}
	if role.Scope != core.RoleScopeUser {
		role.Menus = core.PartnerMenus
	}
	return role, true, nil
}

func validRoleMenus(scope string, menus []string) bool {
	if scope == core.RoleScopeUser {
		return len(menus) == 0
	}
	allowed := core.AdminMenus
	if scope == core.RoleScopePartner {
		allowed = core.PartnerMenus
	} else if scope != core.RoleScopePlatform {
		return false
	}
	for _, m := range menus {
		if !slices.Contains(allowed, m) {
			return false
		}
	}
	return len(menus) > 0
}

type roleView struct {
	ID       string         `json:"id"`
	Version  int64          `json:"version"`
	Data     core.AdminRole `json:"data"`
	Accounts int            `json:"accounts"`
}

func (a *Server) listAdminRoles(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("page") {
		a.adminRolePage(w, r)
		return
	}
	stored, err := store.AllRecords(r.Context(), a.Store, rolesNamespace, "")
	if err != nil {
		dbError(w, err)
		return
	}
	accounts, err := store.AllRecords(r.Context(), a.Store, "admin_accounts", "")
	if err != nil {
		dbError(w, err)
		return
	}
	used := map[string]int{}
	for _, row := range accounts {
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) == nil && !account.Archived {
			used[account.Role]++
		}
	}
	ids := core.BuiltinAdminRoleIDs()
	versions := map[string]int64{}
	for _, row := range stored {
		versions[row.ID] = row.Version
		if !slices.Contains(ids, row.ID) {
			ids = append(ids, row.ID)
		}
	}
	scope := identity(r).PartnerID != ""
	out := []roleView{}
	for _, id := range ids {
		role, ok, e := a.adminRole(r.Context(), id)
		if e != nil {
			dbError(w, e)
			return
		}
		// Provider accounts only ever assign provider roles to their children.
		if ok && (!scope || role.Scope == core.RoleScopePartner) {
			view := roleView{ID: id, Version: versions[id], Data: role, Accounts: used[id]}
			if scope {
				view.Accounts = 0 // platform-wide counts are not a provider's business
			}
			out = append(out, view)
		}
	}
	reply(w, 200, out)
}

func (a *Server) saveAdminRole(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version int64    `json:"version"`
		Name    string   `json:"name"`
		Scope   string   `json:"scope"`
		Menus   []string `json:"menus"`
	}
	if !decode(w, r, &input) {
		return
	}
	id := r.PathValue("id")
	input.Name = strings.TrimSpace(input.Name)
	// Menus of retired pages (内容审核) may linger in older roles; drop them.
	input.Menus = slices.DeleteFunc(input.Menus, func(m string) bool { return m == "reviews" })
	if id == core.SuperAdminRole {
		fail(w, 400, "超级管理员角色不可修改")
		return
	}
	if id != "" {
		current, ok, err := a.adminRole(r.Context(), id)
		if err != nil {
			dbError(w, err)
			return
		}
		if !ok {
			fail(w, 404, "角色不存在")
			return
		}
		input.Scope = current.Scope
	}
	if input.Name == "" || len([]rune(input.Name)) > 20 || !validRoleMenus(input.Scope, input.Menus) {
		fail(w, 400, "角色名称或菜单权限无效；小程序角色不能分配后台菜单")
		return
	}
	if taken, err := a.roleNameTaken(r.Context(), id, input.Name); err != nil {
		dbError(w, err)
		return
	} else if taken {
		fail(w, 409, "已有同名角色，请换一个名称")
		return
	}
	if id == "" {
		id = core.NewID()
	}
	_, system := core.BuiltinAdminRoles()[id]
	if input.Scope != core.RoleScopeUser {
		input.Menus = core.PartnerMenus
	}
	role := core.AdminRole{Name: input.Name, Scope: input.Scope, Menus: input.Menus, System: system}
	row, err := a.Store.Put(r.Context(), rolesNamespace, core.Record{ID: id, Data: core.Data(role)}, input.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, roleView{ID: row.ID, Version: row.Version, Data: role})
}

func (a *Server) deleteAdminRole(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, system := core.BuiltinAdminRoles()[id]; system {
		fail(w, 400, "内置角色不可删除")
		return
	}
	accounts, err := store.AllRecords(r.Context(), a.Store, "admin_accounts", "")
	if err != nil {
		dbError(w, err)
		return
	}
	for _, row := range accounts {
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) == nil && !account.Archived && account.Role == id {
			fail(w, 409, "仍有账号使用该角色，请先调整这些账号")
			return
		}
	}
	row, err := a.Store.Get(r.Context(), rolesNamespace, id)
	if err != nil {
		dbError(w, err)
		return
	}
	var role core.AdminRole
	if json.Unmarshal(row.Data, &role) != nil {
		fail(w, 500, "角色数据异常")
		return
	}
	role.Deleted = true
	if _, err = a.Store.Put(r.Context(), rolesNamespace, core.Record{ID: id, Data: core.Data(role)}, row.Version); err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}

// roleNameTaken keeps role names unique so accounts can be told apart by role.
func (a *Server) roleNameTaken(ctx context.Context, id, name string) (bool, error) {
	for key, role := range core.BuiltinAdminRoles() {
		if key != id && role.Name == name {
			return true, nil
		}
	}
	rows, err := store.AllRecords(ctx, a.Store, rolesNamespace, "")
	if err != nil {
		return false, err
	}
	for _, row := range rows {
		var role core.AdminRole
		if row.ID != id && json.Unmarshal(row.Data, &role) == nil && role.Name == name {
			return true, nil
		}
	}
	return false, nil
}
