package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
)

// menuAllowed reports whether a role may call the admin route.
func menuAllowed(role string, _ []string, method, path string) bool {
	if role == core.SuperAdminRole {
		return true
	}
	return limitedAdminRoute(method, path)
}

// adminAccess resolves the account's role and refuses accounts that may not use
// the admin: unknown roles, provider roles without a provider (or the reverse)
// and providers whose own node or an ancestor is disabled. A message means 403.
func (a *Server) adminAccess(ctx context.Context, account core.AdminAccount) (core.AdminRole, string, error) {
	role, ok, err := a.adminRole(ctx, account.Role)
	if err != nil {
		return role, "", err
	}
	if !ok || role.Scope == core.RoleScopeUser || (role.Scope == core.RoleScopePartner) != (account.PartnerID != "") {
		return role, "管理账号角色无效", nil
	}
	if account.PartnerID != "" {
		err = a.Partners.Active(ctx, account.PartnerID)
		if errors.Is(err, core.ErrPartnerDisabled) || errors.Is(err, core.ErrNotFound) {
			return role, "所属服务商已停用，无法登录后台", nil
		}
		if err != nil {
			return role, "", err
		}
	}
	return role, "", nil
}

func (a *Server) adminMe(w http.ResponseWriter, r *http.Request) {
	v := identity(r)
	out := map[string]any{"id": v.ID, "account": v.Account, "role": v.AdminRole, "scope": core.RoleScopePlatform, "menus": core.AdminMenus}
	out["canApproveRegistrations"] = canApproveRegistrations(r)
	out["canManageAccounts"] = identity(r).AdminRole == core.SuperAdminRole
	if v.AdminRole == "" {
		out["role"] = "limited"
	} else {
		role, ok, err := a.adminRole(r.Context(), v.AdminRole)
		if err != nil {
			dbError(w, err)
			return
		}
		if ok {
			out["roleName"], out["scope"], out["menus"] = role.Name, role.Scope, role.Menus
			if v.AdminRole == core.SuperAdminRole {
				out["menus"] = core.AdminMenus
			}
		}
	}
	if v.AdminRole != core.SuperAdminRole {
		out["menus"] = []string{"partners"}
	}
	if v.PartnerID != "" {
		out["partnerId"] = v.PartnerID
		if row, err := a.Store.Get(r.Context(), "partners", v.PartnerID); err == nil {
			var p core.Partner
			_ = json.Unmarshal(row.Data, &p)
			out["partnerName"] = p.Name
		}
	}
	if row, err := a.Store.Get(r.Context(), "admin_accounts", v.ID); err == nil {
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) == nil {
			if e := a.syncAdminPhone(r.Context(), &account); e != nil {
				dbError(w, e)
				return
			}
			out["userId"] = account.UserID
			out["name"], out["phone"], out["createdAt"] = account.Name, account.Phone, row.CreatedAt
			out["passwordChangedAt"] = account.PasswordChangedAt
		}
	}
	out["sessionExpires"] = v.Expires
	reply(w, 200, out)
}
