package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"strings"
)

func (a *Server) importModel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Key     string `json:"key"`
		Version *int64 `json:"version,omitempty"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), catalogTimeout)
	defer cancel()
	models, err := a.Relay.Catalog(ctx)
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	for _, m := range models {
		if m.Key != strings.TrimSpace(in.Key) {
			continue
		}
		version := int64(0)
		if row, e := a.Store.Get(ctx, "models", m.ID); e == nil {
			if in.Version != nil && *in.Version != row.Version {
				dbError(w, core.ErrConflict)
				return
			}
			var prev core.Model
			if json.Unmarshal(row.Data, &prev) != nil {
				fail(w, 500, "模型数据无效")
				return
			}
			if !prev.Deleted {
				fail(w, 409, "模型已在目录中，请直接配置")
				return
			}
			version = row.Version
			m.Name, m.Points, m.Sort, m.Settings = prev.Name, prev.Points, prev.Sort, prev.Settings
		} else if e != core.ErrNotFound {
			dbError(w, e)
			return
		} else if in.Version != nil {
			dbError(w, core.ErrConflict)
			return
		}
		m.Published = m.Supported()
		row, e := a.Store.Put(ctx, "models", core.Record{ID: m.ID, Data: core.Data(m)}, version)
		if e != nil {
			dbError(w, e)
			return
		}
		reply(w, 201, row)
		return
	}
	fail(w, 400, "此密钥可用的上游目录中没有该模型 ID")
}
