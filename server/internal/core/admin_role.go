package core

// AdminRole is the shared role definition for permissions and user labels.
// Platform/partner scopes grant admin menus; user scope never grants admin
// access. Partner accounts continue to see only their provider's subtree.
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
	RoleScopeUser     = "user"
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
	operator := PartnerMenus
	return map[string]AdminRole{
		SuperAdminRole: {Name: "超级管理员", Scope: RoleScopePlatform, Menus: AdminMenus, System: true},
		"operator":     {Name: "平台运营", Scope: RoleScopePlatform, Menus: operator, System: true},
		"partner":      {Name: "服务商", Scope: RoleScopePartner, Menus: PartnerMenus, System: true},
		RoleBranch:     {Name: "分公司", Scope: RoleScopePartner, Menus: PartnerMenus, System: true},
		RoleS1:         {Name: "S1 服务商", Scope: RoleScopePartner, Menus: PartnerMenus, System: true},
		RoleS2:         {Name: "S2 推荐官", Scope: RoleScopePartner, Menus: PartnerMenus, System: true},
		RoleMember:     {Name: "会员", Scope: RoleScopeUser, Menus: []string{}, System: true},
	}
}

func BuiltinAdminRoleIDs() []string {
	return []string{SuperAdminRole, "operator", "partner", RoleBranch, RoleS1, RoleS2, RoleMember}
}

func IsBusinessRole(id string) bool {
	return id == RoleBranch || id == RoleS1 || id == RoleS2 || id == RoleMember
}
