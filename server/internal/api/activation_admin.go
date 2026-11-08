package api

import (
	"encoding/base64"
	qrcode "github.com/skip2/go-qrcode"
	"net/http"
)

func (a *Server) issueActivationCode(w http.ResponseWriter, r *http.Request) {
	var v struct {
		PartnerID string `json:"partnerId"`
		Label     string `json:"label"`
		Days      int    `json:"days"`
	}
	if !decode(w, r, &v) || !a.inPartnerScope(w, r, v.PartnerID) {
		return
	}
	out, e := a.Partners.Issue(r.Context(), v.PartnerID, v.Label, v.Days, r.Header.Get("Idempotency-Key"), identity(r).ID, identity(r).Account)
	partnerResult(w, out, e)
}
func (a *Server) revealActivationCode(w http.ResponseWriter, r *http.Request) {
	if !a.ownerInScope(w, r, "activation_codes", r.PathValue("id")) {
		return
	}
	code, e := a.Partners.Reveal(r.Context(), r.PathValue("id"))
	if e != nil {
		partnerError(w, e)
		return
	}
	png, e := qrcode.Encode("DOUBO-ACTIVATE:"+code, qrcode.Medium, 320)
	if e != nil {
		fail(w, 503, "二维码生成失败")
		return
	}
	reply(w, 200, map[string]string{"code": code, "qr": "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)})
}
func (a *Server) activationTrace(w http.ResponseWriter, r *http.Request) {
	if !a.ownerInScope(w, r, "activation_codes", r.PathValue("id")) {
		return
	}
	out, e := a.Partners.Trace(r.Context(), r.PathValue("id"))
	partnerResult(w, out, e)
}
func (a *Server) revokeActivationCode(w http.ResponseWriter, r *http.Request) {
	if !a.ownerInScope(w, r, "activation_codes", r.PathValue("id")) {
		return
	}
	e := a.Partners.Cancel(r.Context(), r.PathValue("id"), identity(r).ID)
	partnerResult(w, map[string]bool{"ok": e == nil}, e)
}
func (a *Server) changeMembership(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Status  string `json:"status"`
		Reason  string `json:"reason"`
		Version int64  `json:"version"`
	}
	if !decode(w, r, &v) || !a.dataPartnerInScope(w, r, "memberships", r.PathValue("id")) {
		return
	}
	out, e := a.Partners.ChangeMembership(r.Context(), r.PathValue("id"), v.Status, v.Reason, identity(r).ID, v.Version)
	partnerResult(w, out, e)
}
