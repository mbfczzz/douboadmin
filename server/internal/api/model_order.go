package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"
)

type modelOrderItem struct {
	ID        string    `json:"id"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
}

func (a *Server) orderModels(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Items []modelOrderItem `json:"items"`
	}
	if !decode(w, r, &in) {
		return
	}
	positions := map[string]int{}
	for i, item := range in.Items {
		if _, duplicate := positions[item.ID]; duplicate || item.ID == "" || item.Version < 1 || item.CreatedAt.IsZero() {
			fail(w, 400, "模型排序数据无效，请重新打开排序窗口")
			return
		}
		positions[item.ID] = i
	}
	if len(in.Items) == 0 {
		fail(w, 400, "请选择需要排序的模型")
		return
	}
	err := a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		// Lock in ID order to avoid deadlocks between simultaneous reorderings.
		ordered := append([]modelOrderItem(nil), in.Items...)
		sort.Slice(ordered, func(i, j int) bool { return ordered[i].ID < ordered[j].ID })
		for _, item := range ordered {
			row, err := tx.Lock("models", core.Record{ID: item.ID})
			if err != nil {
				return err
			}
			var model core.Model
			if err := json.Unmarshal(row.Data, &model); err != nil {
				return err
			}
			if row.Version != item.Version || !row.CreatedAt.Equal(item.CreatedAt) || model.Deleted {
				return fmt.Errorf("%w：模型已变更，请重新打开排序窗口", core.ErrConflict)
			}
			model.Sort = positions[item.ID] + 1
			row.Data = core.Data(model)
			if _, err := tx.Put("models", row, row.Version); err != nil {
				return err
			}
		}
		// Reject incomplete snapshots (including concurrent imports), rolling back every write.
		rows, err := tx.Records("models")
		if err != nil {
			return err
		}
		for _, row := range rows {
			var model core.Model
			if err := json.Unmarshal(row.Data, &model); err != nil {
				return err
			}
			if _, included := positions[row.ID]; !model.Deleted && !included {
				return fmt.Errorf("%w：模型目录已变更，请重新打开排序窗口", core.ErrConflict)
			}
		}
		return nil
	})
	if err != nil {
		dbError(w, err)
		return
	}
	if info := auditFrom(r.Context()); info != nil {
		info.targetType, info.detail = "model", fmt.Sprintf("调整模型展示顺序，共 %d 个", len(in.Items))
	}
	reply(w, 200, map[string]bool{"ok": true})
}
