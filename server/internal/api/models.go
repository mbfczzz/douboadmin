package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"sort"
	"strings"
)

func (a *Server) model(ctx context.Context, id string) (core.Model, error) {
	r, err := a.Store.Get(ctx, "models", id)
	var m core.Model
	if err == nil {
		err = json.Unmarshal(r.Data, &m)
	}
	return m.Effective(), err
}

func (a *Server) models(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("page") {
		a.modelPage(w, r)
		return
	}
	rows, err := store.AllRecords(r.Context(), a.Store, "models", "")
	if err != nil {
		dbError(w, err)
		return
	}
	out := []core.Record{}
	jobs, err := a.Store.Jobs(r.Context(), "")
	if err != nil {
		dbError(w, err)
		return
	}
	counts := map[string]int{}
	for _, j := range jobs {
		counts[j.Input.Model]++
	}
	for _, row := range rows {
		var m core.Model
		if json.Unmarshal(row.Data, &m) == nil && !m.Deleted {
			m.RecentJobs = counts[m.ID]
			row.Data = core.Data(m)
			out = append(out, row)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		var x, y core.Model
		_ = json.Unmarshal(out[i].Data, &x)
		_ = json.Unmarshal(out[j].Data, &y)
		if x.Sort == y.Sort {
			return x.Name < y.Name
		}
		return x.Sort < y.Sort
	})
	reply(w, 200, out)
}

func (a *Server) saveModel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Version int64      `json:"version"`
		Data    core.Model `json:"data"`
	}
	if !decode(w, r, &in) {
		return
	}
	old, err := a.Store.Get(r.Context(), "models", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	var m core.Model
	if json.Unmarshal(old.Data, &m) != nil {
		fail(w, 500, "模型数据无效")
		return
	}
	d := in.Data
	if err := d.Settings.Validate(m); err != nil {
		fail(w, 400, err.Error())
		return
	}
	if strings.TrimSpace(d.Name) == "" || len([]rune(d.Name)) > 100 || d.Sort < 0 || d.Points < 0 || math.IsNaN(d.Points) || math.IsInf(d.Points, 0) || d.Points > 1e9 {
		fail(w, 400, "名称、排序或积分设置无效")
		return
	}
	if d.Published && (!m.Supported() || !m.Available) {
		fail(w, 400, "此模型暂不能上架到小程序")
		return
	}
	// Upstream keys and capability definitions cannot be forged by an admin form.
	m.Name = strings.TrimSpace(d.Name)
	m.Sort = d.Sort
	m.Points = d.Points
	m.Published = d.Published
	m.Settings = d.Settings
	row, err := a.Store.Put(r.Context(), "models", core.Record{ID: old.ID, Data: core.Data(m)}, in.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, row)
}

func (a *Server) syncModels(w http.ResponseWriter, r *http.Request) {
	if !a.Relay.Ready() {
		fail(w, 503, "请先在服务端配置中转地址和密钥")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), catalogTimeout)
	defer cancel()
	models, err := a.Relay.Catalog(ctx)
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	var added, updated, conflicts int
	seen := map[string]bool{}
	for _, m := range models {
		seen[m.ID] = true
		old, e := a.Store.Get(ctx, "models", m.ID)
		version := int64(0)
		if e == nil {
			var prev core.Model
			if json.Unmarshal(old.Data, &prev) != nil {
				conflicts++
				continue
			}
			m.Name = prev.Name
			m.Published = prev.Published
			m.Points = prev.Points
			m.Sort = prev.Sort
			m.Deleted = prev.Deleted
			m.Settings = prev.Settings
			version = old.Version
		} else if !errors.Is(e, core.ErrNotFound) {
			dbError(w, e)
			return
		} else {
			m.Published = m.Supported()
		}
		if _, e = a.Store.Put(ctx, "models", core.Record{ID: m.ID, Data: core.Data(m)}, version); e != nil {
			conflicts++
			continue
		}
		if version == 0 {
			added++
		} else {
			updated++
		}
	}
	rows, err := store.AllRecords(ctx, a.Store, "models", "")
	if err != nil {
		dbError(w, err)
		return
	}
	for _, row := range rows {
		if seen[row.ID] {
			continue
		}
		var m core.Model
		if json.Unmarshal(row.Data, &m) != nil {
			continue
		}
		m.Available = false
		if _, e := a.Store.Put(ctx, "models", core.Record{ID: row.ID, Data: core.Data(m)}, row.Version); e != nil {
			conflicts++
		}
	}
	reply(w, 200, map[string]int{"total": len(models), "created": added, "updated": updated, "conflicts": conflicts})
}

func (a *Server) deleteRecord(ns string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Version int64 `json:"version"`
		}
		if !decode(w, r, &in) {
			return
		}
		row, err := a.Store.Get(r.Context(), ns, r.PathValue("id"))
		if err != nil {
			dbError(w, err)
			return
		}
		var v map[string]any
		if json.Unmarshal(row.Data, &v) != nil {
			fail(w, 500, "记录格式无效")
			return
		}
		v["deleted"] = true
		v["published"] = false
		row.Data = core.Data(v)
		if _, err = a.Store.Put(r.Context(), ns, row, in.Version); err != nil {
			dbError(w, err)
			return
		}
		reply(w, 200, map[string]bool{"ok": true})
	}
}
