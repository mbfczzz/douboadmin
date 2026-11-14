package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"time"
)

func (a *Server) purgeModel(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version   int64     `json:"version"`
		CreatedAt time.Time `json:"createdAt"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Version < 1 || input.CreatedAt.IsZero() {
		fail(w, 400, "请刷新模型列表后重新确认彻底删除")
		return
	}
	row, err := a.Store.PurgeModel(r.Context(), r.PathValue("id"), input.Version, input.CreatedAt)
	if err != nil {
		dbError(w, err)
		return
	}
	if info := auditFrom(r.Context()); info != nil {
		var model core.Model
		_ = json.Unmarshal(row.Data, &model)
		info.targetType, info.targetID, info.detail = "model", row.ID, "彻底删除模型："+model.Name
	}
	reply(w, 200, map[string]bool{"ok": true})
}
