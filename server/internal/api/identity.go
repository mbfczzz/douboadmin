package api

import (
	"context"
	"encoding/json"
	"net/http"

	"doubo/server/internal/core"
)

// Legacy response shape; names resolve through the permission role catalog.
// Business eligibility and hierarchy continue to come from Access.
type identityView struct {
	Kind    string `json:"kind"` // branch, s1, s2, member or ""
	Label   string `json:"label"`
	Partner string `json:"partner,omitempty"`
}

func (a *Server) identityOf(ctx context.Context, user string) (identityView, error) {
	access, e := a.Partners.Access(ctx, user)
	if e != nil || !access.Active {
		return identityView{}, e
	}
	kind, partner := core.RoleMember, access.PartnerName
	if access.Status == "provider" {
		row, e := a.Store.Get(ctx, "partners", access.PartnerID)
		if e != nil {
			return identityView{}, e
		}
		var p core.Partner
		_ = json.Unmarshal(row.Data, &p)
		kind, partner = p.Role, p.Name
	}
	role, ok, e := a.adminRole(ctx, kind)
	if e != nil {
		return identityView{}, e
	}
	if !ok || !core.IsBusinessRole(kind) {
		return identityView{}, core.ErrNotFound
	}
	return identityView{Kind: kind, Label: role.Name, Partner: partner}, nil
}

func (a *Server) myIdentity(w http.ResponseWriter, r *http.Request) {
	out, e := a.identityOf(r.Context(), identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, out)
}
