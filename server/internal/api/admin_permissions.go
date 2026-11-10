package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
)

// adminRouteMenus maps each admin API prefix to the menus that may call it.
// A route is reachable when the role holds any listed menu; unknown admin
// routes are denied to everyone except the super administrator.
var adminRouteMenus = map[string][]string{
	"/api/admin/me":                 {},
	"/api/admin/roles":              {"roles"},
	"/api/admin/accounts":           {"accounts"},
	"/api/admin/partners":           {"partners"},
	"/api/admin/partner-policy":     {"partners"},
	"/api/admin/memberships":        {"partners"},
	"/api/admin/commission-ledger":  {"partners"},
	"/api/admin/commission-payouts": {"partners"},
	"/api/admin/alerts":             {"monitor"},
	"/api/admin/logs":               {"monitor"},
	"/api/admin/audit":              {"logs"},
	"/api/admin/monitor":            {"monitor"},
	"/api/admin/assets":             {"templates", "models"},
	"/api/admin/dashboard":          {"overview"},
	"/api/admin/overview":           {"overview"},
	"/api/admin/feedback":           {"feedback"},
	"/api/admin/integrations":       {"settings"},
	"/api/admin/platform":           {"settings", "payments"},
	"/api/admin/jobs":               {"jobs"},
	"/api/admin/models":             {"models"},
	"/api/admin/orders":             {"orders"},
	"/api/admin/payments":           {"payments"},
	"/api/admin/refunds":            {"payments"},
	"/api/admin/virtual-payments":   {"payments"},
	"/api/admin/templates":          {"templates"},
	"/api/admin/users":              {"users"},
	"/api/admin/registrations":      {"users"},
	"/api/admin/works":              {"works"},
}

func routeMenus(method, path string) ([]string, bool) {
	switch {
	case method == http.MethodGet && (path == "/api/admin/roles"):
		// Account and provider forms list roles to pick from.
		return []string{"roles", "accounts", "partners"}, true
	case method == http.MethodGet && path == "/api/admin/models":
		// The template editor needs the model catalogue.
		return []string{"models", "templates"}, true
	case method == http.MethodGet && path == "/api/admin/audit/stats":
		// Request volume and errors are shown on 运行监控 and 日志管理.
		return []string{"monitor", "logs", "overview"}, true
	// A user's operation log and full generation records (raw model calls,
	// materials) keep the menus that guard them elsewhere.
	case strings.HasPrefix(path, "/api/admin/users/") && strings.Contains(path, "/activity"):
		return []string{"logs"}, true
	case strings.HasPrefix(path, "/api/admin/users/") && strings.Contains(path, "/jobs/"):
		return []string{"jobs"}, true
	case strings.HasPrefix(path, "/api/admin/orders/") && strings.HasSuffix(path, "/distribution"):
		return []string{"orders", "partners"}, true
	}
	for prefix, menus := range adminRouteMenus {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return menus, true
		}
	}
	return nil, false
}

// menuAllowed reports whether a role may call the admin route.
func menuAllowed(role string, granted []string, method, path string) bool {
	if role == core.SuperAdminRole || !strings.HasPrefix(path, "/api/admin/") {
		return true
	}
	menus, known := routeMenus(method, path)
	if !known {
		return false
	}
	if len(menus) == 0 {
		return true
	}
	for _, m := range menus {
		if slices.Contains(granted, m) {
			return true
		}
	}
	return false
}

// adminAccess resolves the account's role and refuses accounts that may not use
// the admin: unknown roles, provider roles without a provider (or the reverse)
// and providers whose own node or an ancestor is disabled. A message means 403.
func (a *Server) adminAccess(ctx context.Context, account core.AdminAccount) (core.AdminRole, string, error) {
	role, ok, err := a.adminRole(ctx, account.Role)
	if err != nil {
		return role, "", err
	}
	if !ok || (role.Scope == core.RoleScopePartner) != (account.PartnerID != "") {
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
	if v.AdminRole == "" {
		out["role"] = core.SuperAdminRole
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
			out["name"], out["phone"], out["createdAt"] = account.Name, account.Phone, row.CreatedAt
			out["passwordChangedAt"] = account.PasswordChangedAt
		}
	}
	out["sessionExpires"] = v.Expires
	reply(w, 200, out)
}
