package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

func (a *Server) templates(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("page") {
		a.templatePage(w, r, nil)
		return
	}
	rows, e := store.AllRecords(r.Context(), a.Store, "templates", "")
	if e != nil {
		dbError(w, e)
		return
	}
	out, admin, ready := []core.Record{}, strings.Contains(r.URL.Path, "/admin/"), a.modelReady(r)
	for _, row := range rows {
		var t core.Template
		_ = json.Unmarshal(row.Data, &t)
		// Users only see templates they can actually submit with.
		if t.Kind != "video" || t.Deleted || (!admin && (!t.Published || !ready(t.Model))) {
			continue
		}
		q := r.URL.Query()
		if q.Get("category") != "" && q.Get("category") != "推荐" && t.Category != q.Get("category") {
			continue
		}
		if q.Get("kind") != "" && t.Kind != q.Get("kind") {
			continue
		}
		if q.Get("q") != "" && !strings.Contains(t.Title, q.Get("q")) {
			continue
		}
		a.templateCover(r, &t)
		row.Data = core.Data(t)
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		var x, y core.Template
		_ = json.Unmarshal(out[i].Data, &x)
		_ = json.Unmarshal(out[j].Data, &y)
		return x.Sort < y.Sort
	})
	reply(w, 200, out)
}

func (a *Server) template(w http.ResponseWriter, r *http.Request) {
	row, e := a.Store.Get(r.Context(), "templates", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	var t core.Template
	_ = json.Unmarshal(row.Data, &t)
	if t.Kind != "video" || !t.Published || t.Deleted || !a.modelReady(r)(t.Model) {
		fail(w, 404, "模板已下架")
		return
	}
	a.templateCoverSized(r, &t, 1080)
	row.Data = core.Data(t)
	reply(w, 200, row)
}

func (a *Server) saveTemplate(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64         `json:"version"`
		Data    core.Template `json:"data"`
	}
	if !decode(w, r, &v) {
		return
	}
	t := v.Data
	if t.Kind != "video" {
		fail(w, 400, "模板仅支持视频")
		return
	}
	if strings.TrimSpace(t.Title) == "" || len([]rune(t.Title)) > 50 || t.Prompt == "" || len([]rune(t.Prompt)) > 500 || t.RequiredImages < 0 || t.RequiredImages > 5 || t.Sort < 0 {
		fail(w, 400, "模板标题、提示词、类型或素材数量无效")
		return
	}
	if err := a.validateTemplate(r, &t); err != nil {
		fail(w, 400, err.Error())
		return
	}
	id := r.PathValue("id")
	if len(id) > 64 {
		fail(w, 400, "模板标识过长")
		return
	}
	row, e := a.Store.Put(r.Context(), "templates", core.Record{ID: id, Data: core.Data(t)}, v.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}

// templateVisible is the user-side rule: published, not deleted, live model.
func (a *Server) templateVisible(r *http.Request, ready func(string) bool, id string) bool {
	row, err := a.Store.Get(r.Context(), "templates", id)
	if err != nil {
		return false
	}
	var t core.Template
	return json.Unmarshal(row.Data, &t) == nil && t.Kind == "video" && t.Published && !t.Deleted && ready(t.Model)
}

// visibleTemplates lists the ids users can open, in one read of templates.
func (a *Server) visibleTemplates(r *http.Request) (map[string]bool, error) {
	rows, err := store.AllRecords(r.Context(), a.Store, "templates", "")
	if err != nil {
		return nil, err
	}
	ready, out := a.modelReady(r), map[string]bool{}
	for _, row := range rows {
		var t core.Template
		if json.Unmarshal(row.Data, &t) == nil && t.Kind == "video" && t.Published && !t.Deleted && ready(t.Model) {
			out[row.ID] = true
		}
	}
	return out, nil
}

// modelReady reports whether a template's model is published and usable,
// remembering each lookup for the rest of the request.
func (a *Server) modelReady(r *http.Request) func(string) bool {
	seen := map[string]bool{}
	return func(id string) bool {
		ok, cached := seen[id]
		if !cached {
			m, err := a.model(r.Context(), id)
			ok = err == nil && m.Usable()
			seen[id] = ok
		}
		return ok
	}
}
