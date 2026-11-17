package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"doubo/server/internal/templateimport"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

type templateImportInput struct {
	Pack    templateimport.Pack `json:"pack"`
	Publish bool                `json:"publish"`
}

func (a *Server) templateImport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var input templateImportInput
	reader := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20))
	if err := reader.Decode(&input); err != nil {
		fail(w, 400, "导出文件无法读取或超过 8 MB")
		return
	}
	if err := reader.Decode(new(any)); err != io.EOF {
		fail(w, 400, "导出文件格式无效")
		return
	}
	rows, err := store.AllRecords(r.Context(), a.Store, "models", "")
	if err != nil {
		dbError(w, err)
		return
	}
	models := []core.Model{}
	for _, row := range rows {
		var m core.Model
		if json.Unmarshal(row.Data, &m) == nil {
			models = append(models, m)
		}
	}
	items, err := templateimport.Plan(input.Pack, models, input.Publish)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	apply := r.URL.Path == "/api/admin/templates/import"
	counts := map[string]int{}
	for i := range items {
		item := &items[i]
		if item.Action == "create" {
			if _, err = a.Store.Get(r.Context(), "templates", item.ID); err == nil {
				item.Action, item.Reason = "duplicate", "已存在相同来源编号，保留测试环境现有内容"
			} else if !errors.Is(err, core.ErrNotFound) {
				dbError(w, err)
				return
			} else if err = validateTemplateContent(item.Data); err != nil {
				item.Action, item.Reason = "blocked", err.Error()
			} else if err = a.validateTemplate(r, &item.Data); err != nil {
				item.Action, item.Reason = "blocked", err.Error()
			}
		}
	}
	for i := range items {
		item := &items[i]
		if apply && item.Action == "create" {
			_, err = a.Store.Put(r.Context(), "templates", core.Record{ID: item.ID, Data: core.Data(item.Data)}, 0)
			if err == nil {
				item.Action = "imported"
			} else if errors.Is(err, core.ErrConflict) {
				item.Action, item.Reason = "duplicate", "此来源编号已由其他导入写入，请刷新核对"
			} else {
				item.Action, item.Reason = "blocked", "保存失败，可重新导入继续处理"
			}
		}
		counts[item.Action]++
	}
	reply(w, 200, map[string]any{"total": len(items), "applied": apply, "publish": input.Publish, "counts": counts, "items": items})
}
