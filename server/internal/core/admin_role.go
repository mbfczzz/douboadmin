package core

// AdminRole grants an admin account a set of menus. Partner-scope roles are
// bound to one provider account and only ever see that provider's subtree.
type AdminRole struct {
	Name   string   `json:"name"`
	Scope  string   `json:"scope"`
	Menus  []string `json:"menus"`
	System bool     `json:"system,omitempty"`
	// Deleted roles are kept for audit history but can no longer be assigned.
	Deleted bool `json:"deleted,omitempty"`
}

const (
	RoleScopePlatform = "platform"
	RoleScopePartner  = "partner"
	SuperAdminRole    = "super_admin"
)

// AdminMenus lists every admin page that can be granted to a role.
var AdminMenus = []string{"overview", "templates", "jobs", "works", "users", "partners", "orders", "payments", "accounts", "roles", "models", "monitor", "logs", "feedback", "settings"}

// PartnerMenus are the only menus a provider role may hold; platform-wide data
// such as all users or orders must never be granted to a provider account.
var PartnerMenus = []string{"partners"}

// BuiltinAdminRoles are always available. Stored records with the same id
// override name and menus, except for super_admin which is fixed.
func BuiltinAdminRoles() map[string]AdminRole {
	operator := []string{}
	for _, m := range AdminMenus {
		if m != "roles" {
			operator = append(operator, m)
		}
	}
	return map[string]AdminRole{
		SuperAdminRole: {Name: "超级管理员", Scope: RoleScopePlatform, Menus: AdminMenus, System: true},
		"operator":     {Name: "平台运营", Scope: RoleScopePlatform, Menus: operator, System: true},
		"partner":      {Name: "服务商", Scope: RoleScopePartner, Menus: PartnerMenus, System: true},
	}
}
