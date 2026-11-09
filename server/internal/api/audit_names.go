package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
)

// auditName resolves an id to a display name for the log. It runs in the
// log writer goroutine (cached there), never on the request path.
func (a *Server) auditName(ctx context.Context, kind, id string) string {
	field := func(ns string, keys ...string) string {
		row, err := a.Store.Get(ctx, ns, id)
		if err != nil {
			return ""
		}
		var m map[string]any
		_ = json.Unmarshal(row.Data, &m)
		for _, k := range keys {
			if v, ok := m[k].(string); ok && v != "" {
				return v
			}
		}
		return ""
	}
	switch kind {
	case "user":
		return field("users", "nickname", "name")
	case "admin", "provider":
		if name := field("admin_accounts", "name"); name != "" {
			return name + "（" + field("admin_accounts", "username") + "）"
		}
	case "partner":
		return field("partners", "name")
	case "model":
		return field("models", "name")
	case "template":
		return field("templates", "title")
	case "role":
		if role, ok := core.BuiltinAdminRoles()[id]; ok {
			return role.Name
		}
		return field(rolesNamespace, "name")
	case "job":
		if j, err := a.Store.Job(ctx, id); err == nil {
			return short(j.Input.Prompt, 30)
		}
	}
	return ""
}
