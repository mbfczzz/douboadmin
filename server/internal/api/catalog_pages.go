package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

func (a *Server) templateCategories(w http.ResponseWriter, r *http.Request) {
	rows, e := store.AllRecords(r.Context(), a.Store, "templates", "")
	if e != nil {
		dbError(w, e)
		return
	}
	seen := map[string]bool{}
	categories := []string{}
	for _, row := range rows {
		var t core.Template
		if json.Unmarshal(row.Data, &t) == nil && !t.Deleted && t.Category != "" && !seen[t.Category] {
			seen[t.Category] = true
			categories = append(categories, t.Category)
		}
	}
	sort.Strings(categories)
	reply(w, 200, categories)
}

func (a *Server) templatePage(w http.ResponseWriter, r *http.Request, ids []string) {
	q, ok := listQuery(w, r, "templates")
	if !ok {
		return
	}
	q.IDs = ids
	q.Fields["deleted"] = "false"
	params := r.URL.Query()
	for _, key := range []string{"kind", "category"} {
		if value := params.Get(key); value != "" && value != "推荐" {
			q.Fields[key] = value
		}
	}
	if params.Get("sort") != "newest" {
		q.SortField = "sort"
	}
	admin := strings.Contains(r.URL.Path, "/admin/")
	if state := params.Get("status"); admin && state != "" {
		q.Fields["published"] = "false"
		if state == "published" {
			q.Fields["published"] = "true"
		}
	}
	if !admin {
		q.Fields["published"] = "true"
		models, e := store.AllRecords(r.Context(), a.Store, "models", "")
		if e != nil {
			dbError(w, e)
			return
		}
		ready := []string{}
		for _, row := range models {
			var m core.Model
			if json.Unmarshal(row.Data, &m) == nil && m.Effective().Usable() {
				ready = append(ready, row.ID)
			}
		}
		q.FieldsIn = map[string][]string{"model": ready}
	}
	page, e := a.Store.RecordPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	for i := range page.Items {
		var t core.Template
		_ = json.Unmarshal(page.Items[i].Data, &t)
		a.templateCover(r, &t)
		page.Items[i].Data = core.Data(t)
	}
	reply(w, 200, page)
}

func (a *Server) modelPage(w http.ResponseWriter, r *http.Request) {
	q, ok := listQuery(w, r, "models")
	if !ok {
		return
	}
	q.Fields["deleted"] = "false"
	if kind := r.URL.Query().Get("kind"); kind != "" {
		q.Fields["kind"] = kind
	}
	q.SortField = "sort"
	page, e := a.Store.RecordPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	jobs, e := a.Store.Jobs(r.Context(), "")
	if e != nil {
		dbError(w, e)
		return
	}
	counts := map[string]int{}
	for _, j := range jobs {
		counts[j.Input.Model]++
	}
	for i := range page.Items {
		var m core.Model
		_ = json.Unmarshal(page.Items[i].Data, &m)
		m.RecentJobs = counts[m.ID]
		page.Items[i].Data = core.Data(m)
	}
	reply(w, 200, page)
}

func (a *Server) favoriteTemplates(w http.ResponseWriter, r *http.Request) {
	q, ok := listQuery(w, r, "favorites")
	if !ok {
		return
	}
	q.Owner = identity(r).ID
	q.Fields["active"] = "true"
	page, e := a.Store.RecordPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	items, unavailable := []core.Record{}, []core.Record{}
	ready := a.modelReady(r)
	for _, row := range page.Items {
		var f struct {
			TemplateID string `json:"templateId"`
			Active     bool   `json:"active"`
		}
		if json.Unmarshal(row.Data, &f) != nil {
			unavailable = append(unavailable, row)
			continue
		}
		template, err := a.Store.Get(r.Context(), "templates", f.TemplateID)
		if err != nil && err != core.ErrNotFound {
			dbError(w, err)
			return
		}
		var t core.Template
		if err != nil || json.Unmarshal(template.Data, &t) != nil || t.Deleted || !t.Published || !ready(t.Model) {
			unavailable = append(unavailable, row)
			continue
		}
		a.templateCover(r, &t)
		template.Data = core.Data(t)
		items = append(items, template)
	}
	reply(w, 200, map[string]any{"items": items, "unavailable": unavailable, "total": page.Total, "page": page.Page, "size": page.Size})
}

func (a *Server) favoriteState(w http.ResponseWriter, r *http.Request) {
	id := core.Digest(identity(r).ID + ":" + r.PathValue("id"))[:32]
	row, e := a.Store.Get(r.Context(), "favorites", id)
	if e == core.ErrNotFound {
		reply(w, 200, core.Record{ID: id, Data: core.Data(map[string]any{"active": false})})
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
