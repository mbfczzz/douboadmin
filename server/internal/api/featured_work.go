package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"time"
)

func (a *Server) setFeaturedWork(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Featured *bool  `json:"featured"`
		Version  *int64 `json:"version"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Featured == nil || in.Version == nil || *in.Version < 0 {
		fail(w, 400, "请刷新作品列表后重试")
		return
	}
	j, err := a.Store.Job(r.Context(), r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	if *in.Featured {
		if err = a.checkShareAccess(r.Context(), j); err != nil {
			fail(w, 409, "只有正常、已完成且可分享的图片或视频作品才能设为优秀")
			return
		}
		if j.Result == "" {
			fail(w, 409, "作品没有可展示的生成结果")
			return
		}
		if _, err = a.featuredView(r, j, core.WorkMeta{}); err != nil {
			fail(w, 409, "作品结果暂不可用，无法设为优秀")
			return
		}
	}
	err = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		row, err := tx.Lock("work_meta", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(core.WorkMeta{})})
		if err != nil {
			return err
		}
		// A missing metadata row has client version zero; its initializer is version one.
		expected := *in.Version
		if expected == 0 {
			expected = 1
		}
		var meta core.WorkMeta
		if err = json.Unmarshal(row.Data, &meta); err != nil {
			return err
		}
		if row.Version != expected || (*in.Version == 0 && (meta.Featured || meta.Deleted || meta.FeaturedAt != nil)) {
			return core.ErrConflict
		}
		if *in.Featured && meta.Deleted {
			return core.ErrConflict
		}
		meta.Featured = *in.Featured
		if *in.Featured {
			now := time.Now().UTC()
			meta.FeaturedAt = &now
		}
		row.Data = core.Data(meta)
		_, err = tx.Put("work_meta", row, row.Version)
		return err
	})
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}
