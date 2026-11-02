package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"slices"
	"sort"
	"strings"
)

func (a *Server) templates(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "templates", "")
	if e != nil {
		dbError(w, e)
		return
	}
	out := []core.Record{}
	for _, row := range rows {
		var t core.Template
		_ = json.Unmarshal(row.Data, &t)
		if t.Deleted || (!strings.Contains(r.URL.Path, "/admin/") && !t.Published) {
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
	if !t.Published || t.Deleted {
		fail(w, 404, "模板已下架")
		return
	}
	a.templateCover(r, &t)
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
	if strings.TrimSpace(t.Title) == "" || len([]rune(t.Title)) > 50 || t.Prompt == "" || len([]rune(t.Prompt)) > 500 || !slices.Contains([]string{"video", "image"}, t.Kind) || t.RequiredImages < 0 || t.RequiredImages > 5 || t.Sort < 0 {
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
