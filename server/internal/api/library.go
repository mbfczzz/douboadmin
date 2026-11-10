package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

func (a *Server) favorites(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("page") {
		q, ok := listQuery(w, r, "favorites")
		if !ok {
			return
		}
		q.Owner = identity(r).ID
		page, e := a.Store.RecordPage(r.Context(), q)
		if e != nil {
			dbError(w, e)
			return
		}
		reply(w, 200, page)
		return
	}
	rows, e := store.AllRecords(r.Context(), a.Store, "favorites", identity(r).ID)
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
	// Only templates users can see may be favorited. Removing works for any
	// existing favorite or template, but never creates records for unknown ids.
	if v.Active && !a.templateVisible(r, a.modelReady(r), tid) {
		fail(w, 404, "模板已下架")
		return
	}
	if !v.Active && v.Version == 0 {
		if _, e := a.Store.Get(r.Context(), "templates", tid); e != nil {
			dbError(w, e)
			return
		}
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

// users is one page of mini-program users; search and filters run in the
// database so every user is reachable however many there are.
func (a *Server) users(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	page, e := strconv.Atoi(v.Get("page"))
	if e != nil || page < 1 {
		page = 1
	}
	q := core.UserQuery{Search: strings.TrimSpace(v.Get("q")), State: v.Get("state"), Access: v.Get("access"), Page: page, Size: 20}
	if !q.Valid() {
		fail(w, 400, "查询条件无效")
		return
	}
	out, e := a.Store.UserPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	rows := out.Items
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
	reply(w, 200, out)
}

// Local upload is deliberately disabled in production. OSS is injected through
// Objects, allowing the same API shape without node-local files in a cluster.
