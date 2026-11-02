package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func (a *Server) favorites(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "favorites", identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, rows)
}

func (a *Server) favorite(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64 `json:"version"`
		Active  bool  `json:"active"`
	}
	if !decode(w, r, &v) {
		return
	}
	tid := r.PathValue("id")
	if _, e := a.Store.Get(r.Context(), "templates", tid); e != nil {
		dbError(w, e)
		return
	}
	id := identity(r).ID
	row, e := a.Store.Put(r.Context(), "favorites", core.Record{ID: core.Digest(id + ":" + tid)[:32], Owner: id, Data: core.Data(map[string]any{"templateId": tid, "active": v.Active})}, v.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}

func (a *Server) feedback(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Content string `json:"content"`
	}
	if !decode(w, r, &v) {
		return
	}
	v.Content = strings.TrimSpace(v.Content)
	if len([]rune(v.Content)) < 3 || len([]rune(v.Content)) > 1000 {
		fail(w, 400, "请填写 3–1000 字反馈")
		return
	}
	row, e := a.Store.Put(r.Context(), "feedback", core.Record{ID: core.NewID(), Owner: identity(r).ID, Data: core.Data(v)}, 0)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 201, row)
}

func (a *Server) users(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "users", "")
	if e != nil {
		dbError(w, e)
		return
	}
	for i := range rows {
		var profile map[string]any
		if e = json.Unmarshal(rows[i].Data, &profile); e != nil {
			dbError(w, e)
			return
		}
		access, err := a.Partners.Access(r.Context(), rows[i].ID)
		if err != nil {
			dbError(w, err)
			return
		}
		profile["access"] = access
		member, err := a.Store.Get(r.Context(), "memberships", rows[i].ID)
		if err == nil {
			profile["membership"] = member
		} else if !errors.Is(err, core.ErrNotFound) {
			dbError(w, err)
			return
		}
		rows[i].Data = core.Data(profile)
	}
	reply(w, 200, rows)
}

// Local upload is deliberately disabled in production. OSS is injected through
// Objects, allowing the same API shape without node-local files in a cluster.
