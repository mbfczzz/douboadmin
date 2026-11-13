package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

func providerPageNumber(w http.ResponseWriter, r *http.Request) (int, bool) {
	page := 1
	if raw := r.URL.Query().Get("page"); raw != "" {
		n, e := strconv.Atoi(raw)
		if e != nil || n < 1 || n > 1000000 {
			fail(w, 400, "页码无效")
			return 0, false
		}
		page = n
	}
	if len([]rune(r.URL.Query().Get("q"))) > 100 {
		fail(w, 400, "搜索条件过长")
		return 0, false
	}
	return page, true
}

type providerTreeItem struct {
	core.Record
	Children int `json:"children"`
}

func (a *Server) providerTreePage(w http.ResponseWriter, r *http.Request) {
	page, ok := providerPageNumber(w, r)
	if !ok {
		return
	}
	parent, search := r.URL.Query().Get("parent"), strings.TrimSpace(r.URL.Query().Get("q"))
	scope, e := a.partnerScope(r)
	if e != nil {
		dbError(w, e)
		return
	}
	query := core.RecordQuery{Namespace: "partners", Page: page, Size: 20, Search: search, FieldsIn: map[string][]string{"status": {"active", "pending", "disabled"}}}
	if search != "" {
		query.IDs = scope
	} else if parent != "" {
		if !a.inPartnerScope(w, r, parent) {
			return
		}
		query.Owner = parent
	} else if scope != nil {
		query.IDs = []string{identity(r).PartnerID}
	} else {
		query.Owner = core.RootPartner
	}
	out, e := a.Store.RecordPage(r.Context(), query)
	if e != nil {
		dbError(w, e)
		return
	}
	items := make([]providerTreeItem, 0, len(out.Items))
	for _, row := range out.Items {
		children, e := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: "partners", Owner: row.ID, Page: 1, Size: 1, FieldsIn: map[string][]string{"status": {"active", "pending", "disabled"}}})
		if e != nil {
			dbError(w, e)
			return
		}
		items = append(items, providerTreeItem{Record: row, Children: children.Total})
	}
	reply(w, 200, map[string]any{"items": items, "page": page, "size": 20, "total": out.Total})
}

func (a *Server) providerChildren(w http.ResponseWriter, r *http.Request) {
	id, _, _, ok := a.managedPartner(w, r)
	if !ok {
		return
	}
	page, ok := providerPageNumber(w, r)
	if !ok {
		return
	}
	out, e := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: "partners", Owner: id, Page: page, Size: 20, FieldsIn: map[string][]string{"status": {"active", "pending", "disabled"}}})
	if e != nil {
		dbError(w, e)
		return
	}
	items := make([]childView, 0, len(out.Items))
	for _, row := range out.Items {
		var p core.Partner
		if e = json.Unmarshal(row.Data, &p); e != nil {
			dbError(w, e)
			return
		}
		n, e := a.members(r.Context(), row.ID)
		if e != nil {
			dbError(w, e)
			return
		}
		_, account, _, e := a.providerAccount(r.Context(), row.ID)
		if e != nil {
			dbError(w, e)
			return
		}
		role, _, e := a.adminRole(r.Context(), p.Role)
		if e != nil {
			dbError(w, e)
			return
		}
		items = append(items, childView{ID: row.ID, Name: p.Name, Role: p.Role, RoleName: role.Name, Status: p.Status, Members: n, Account: account.Username, Scanned: p.OwnerUser != "", CreatedAt: row.CreatedAt})
	}
	reply(w, 200, map[string]any{"items": items, "page": page, "size": 20, "total": out.Total})
}
