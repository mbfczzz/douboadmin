package api

import "net/http"

func (a *Server) userBusinessIdentity(w http.ResponseWriter, r *http.Request) {
	out, err := a.Partners.IdentityAssignment(r.Context(), r.PathValue("id"))
	partnerResult(w, out, err)
}

func (a *Server) changeUserBusinessIdentity(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version  int64  `json:"version"`
		Kind     string `json:"kind"`
		ParentID string `json:"parentId"`
	}
	if !decode(w, r, &input) {
		return
	}
	out, err := a.Partners.ChangeIdentity(r.Context(), r.PathValue("id"), input.Kind, input.ParentID, identity(r).ID, input.Version)
	partnerResult(w, out, err)
}
