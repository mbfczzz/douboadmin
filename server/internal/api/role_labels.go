package api

import (
	"doubo/server/internal/core"
	"net/http"
)

// A small display catalog: readers of users/providers need names, not the
// complete permission definitions or platform account counts.
func (a *Server) businessRoleLabels(w http.ResponseWriter, r *http.Request) {
	labels := map[string]string{}
	for _, id := range []string{core.RoleBranch, core.RoleS1, core.RoleS2, core.RoleMember} {
		role, ok, err := a.adminRole(r.Context(), id)
		if err != nil {
			dbError(w, err)
			return
		}
		if ok {
			labels[id] = role.Name
		}
	}
	reply(w, 200, labels)
}
