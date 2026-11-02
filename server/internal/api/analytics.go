package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
)

func (a *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if !slices.Contains([]int{7, 30, 90}, days) {
		days = 30
	}
	data, e := a.Store.Dashboard(r.Context(), days)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, data)
}
func (a *Server) track(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Name     string `json:"name"`
		Page     string `json:"page"`
		TargetID string `json:"targetId"`
	}
	if !decode(w, r, &v) {
		return
	}
	if !slices.Contains([]string{"page_view", "template_view", "generate_submit", "work_saved", "share_created", "search"}, v.Name) || len(v.Page) > 40 || len(v.TargetID) > 64 {
		fail(w, 400, "事件格式无效")
		return
	}
	preferences := core.DefaultPreferences()
	if row, e := a.Store.Get(r.Context(), "preferences", identity(r).ID); e == nil {
		_ = json.Unmarshal(row.Data, &preferences)
	}
	if !preferences.Analytics {
		w.WriteHeader(204)
		return
	}
	_, e := a.Store.Put(r.Context(), "analytics", core.Record{ID: core.NewID(), Owner: identity(r).ID, Data: core.Data(v)}, 0)
	if e != nil {
		dbError(w, e)
		return
	}
	w.WriteHeader(204)
}
