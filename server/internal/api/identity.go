package api

import (
	"context"
	"encoding/json"
	"net/http"

	"doubo/server/internal/core"
)

// identityView labels an opened mini-program account: a 分公司, an S1
// 服务商, an S2 推荐官 or a 会员. Display only; it grants nothing.
type identityView struct {
	Kind    string `json:"kind"` // branch, s1, s2, member or ""
	Label   string `json:"label"`
	Partner string `json:"partner,omitempty"`
}

var roleLabels = map[string]string{core.RoleBranch: "分公司", core.RoleS1: "S1 服务商", core.RoleS2: "S2 推荐官"}

func (a *Server) identityOf(ctx context.Context, user string) (identityView, error) {
	access, e := a.Partners.Access(ctx, user)
	if e != nil || !access.Active {
		return identityView{}, e
	}
	if access.Status == "provider" {
		row, e := a.Store.Get(ctx, "partners", access.PartnerID)
		if e != nil {
			return identityView{}, e
		}
		var p core.Partner
		_ = json.Unmarshal(row.Data, &p)
		return identityView{Kind: p.Role, Label: roleLabels[p.Role], Partner: p.Name}, nil
	}
	return identityView{Kind: "member", Label: "会员", Partner: access.PartnerName}, nil
}

func (a *Server) myIdentity(w http.ResponseWriter, r *http.Request) {
	out, e := a.identityOf(r.Context(), identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, out)
}
