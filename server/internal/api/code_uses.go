package api

import (
	"net/http"
	"strings"

	"doubo/server/internal/core"
	"doubo/server/internal/partners"
)

func (a *Server) codeUses(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !a.inPartnerScope(w, r, id) {
		return
	}
	page, ok := providerPageNumber(w, r)
	if !ok {
		return
	}
	kind := r.URL.Query().Get("kind")
	if kind == "member" {
		kind = ""
	}
	if kind != "" && kind != "s1" && kind != "s2" && kind != "bind" && kind != "promo" {
		fail(w, 400, "二维码类型无效")
		return
	}
	code, valid := partners.NormalizeShareCode(r.URL.Query().Get("code"))
	if !valid {
		fail(w, 400, "请指定当前页面的二维码")
		return
	}
	status := r.URL.Query().Get("status")
	if status != "" && status != "pending" && status != "approved" && status != "rejected" {
		fail(w, 400, "登记状态无效")
		return
	}
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	if code, valid := partners.NormalizeShareCode(search); valid {
		search = code
	}
	query := core.RecordQuery{Namespace: "code_uses", Owner: id, Fields: map[string]string{"codeKind": kind, "code": code}, Search: search, Status: status, Page: page, Size: 20}
	rows, e := a.Store.RecordPage(r.Context(), query)
	partnerResult(w, rows, e)
}
