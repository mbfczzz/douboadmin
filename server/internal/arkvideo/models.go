package arkvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

// Ensure lists the fixed Seedance models in 模型管理 at start. Their official
// capabilities are restored every time; the operator's name, order, shelf
// state and settings (prices included) are kept. A deleted row stays deleted.
// They are usable only once the 火山方舟视频生成 key is set (ready).
func Ensure(ctx context.Context, s store.Store, ready bool) error {
	for i, spec := range Models {
		id := ModelID(spec.ID)
		row, err := s.Get(ctx, "models", id)
		if errors.Is(err, core.ErrNotFound) {
			m := core.Model{ID: id, Name: spec.Name, Published: true, Available: ready, Sort: 800 + i, Settings: spec.Defaults()}
			spec.Apply(&m)
			if _, err = s.Put(ctx, "models", core.Record{ID: id, Data: core.Data(m)}, 0); err != nil && !errors.Is(err, core.ErrConflict) {
				return err // a lost race with the other process is fine
			}
			continue
		}
		if err != nil {
			return err
		}
		var m core.Model
		if json.Unmarshal(row.Data, &m) != nil {
			continue
		}
		before := string(core.Data(m))
		spec.Apply(&m)
		m.Available = ready
		if len(m.Settings.VideoTokenPrices) == 0 {
			m.Settings.VideoTokenPrices = spec.Defaults().VideoTokenPrices
		}
		if string(core.Data(m)) == before {
			continue
		}
		if _, err = s.Put(ctx, "models", core.Record{ID: id, Data: core.Data(m)}, row.Version); err != nil && !errors.Is(err, core.ErrConflict) {
			return err
		}
	}
	return nil
}
