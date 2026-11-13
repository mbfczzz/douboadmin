package api

import "net/http"

func (a *Server) previewPartnerDelete(w http.ResponseWriter, r *http.Request) {
	out, e := a.Partners.DeleteTree(r.Context(), r.PathValue("id"), "", "", identity(r).ID, false)
	partnerResult(w, out, e)
}
func (a *Server) deletePartner(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token   string `json:"token"`
		Reason  string `json:"reason"`
		Confirm string `json:"confirm"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Confirm != "delete-users" {
		fail(w, 400, "删除将同时删除用户账号，请刷新页面并勾选确认")
		return
	}
	out, e := a.Partners.DeleteTree(r.Context(), r.PathValue("id"), input.Token, input.Reason, identity(r).ID, true)
	partnerResult(w, out, e)
}
