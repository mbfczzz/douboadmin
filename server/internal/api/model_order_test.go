package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func orderFixture(t *testing.T, a *Server, count int) []modelOrderItem {
	t.Helper()
	// The shared setup seeds an unrelated model. Keep it deleted to also exercise exclusion.
	seed, _ := a.Store.Get(t.Context(), "models", "demo-image")
	seed.Data = core.Data(core.Model{ID: seed.ID, Deleted: true})
	if _, err := a.Store.Put(t.Context(), "models", seed, seed.Version); err != nil {
		t.Fatal(err)
	}
	items := []modelOrderItem{}
	for i := 0; i < count; i++ {
		id := fmt.Sprintf("order-%02d", i)
		model := core.Model{ID: id, Key: id, Name: id, Kind: "image", Published: true, Available: true, Sort: 0, Points: 7}
		row, err := a.Store.Put(t.Context(), "models", core.Record{ID: id, Data: core.Data(model)}, 0)
		if err != nil {
			t.Fatal(err)
		}
		items = append(items, modelOrderItem{row.ID, row.Version, row.CreatedAt})
	}
	return items
}

func TestModelOrderMatchesPaginatedAdminAndMiniProgram(t *testing.T) {
	a, token := modelServer(t)
	items := orderFixture(t, a, 25)
	// With equal sort values, the admin's default order must match the mini program too.
	check := func(expected []modelOrderItem) {
		t.Helper()
		w := call(a, "GET", "/api/config", "", "", nil)
		var config struct {
			Models []core.Model `json:"models"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &config); err != nil || len(config.Models) != len(expected) {
			t.Fatal(w.Body.String(), err)
		}
		var all []core.Record
		w = call(a, "GET", "/api/admin/models", token, "", nil)
		if err := json.Unmarshal(w.Body.Bytes(), &all); err != nil || len(all) != len(expected) {
			t.Fatal(w.Body.String(), err)
		}
		for page := 1; page <= 2; page++ {
			w = call(a, "GET", fmt.Sprintf("/api/admin/models?page=%d&size=20&kind=image", page), token, "", nil)
			var result core.RecordPage
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.Total != len(expected) {
				t.Fatal(w.Body.String(), err)
			}
			for i, row := range result.Items {
				index := (page-1)*20 + i
				if row.ID != expected[index].ID || config.Models[index].ID != row.ID || all[index].ID != row.ID {
					t.Fatalf("inconsistent ordering at %d: %s", index, row.ID)
				}
				if config.Models[index].Points != 7 {
					t.Fatal("reorder changed pricing")
				}
			}
		}
	}
	check(items)
	items = append(items[24:], items[:24]...)
	w := call(a, "PUT", "/api/admin/models/order", token, "", map[string]any{"items": items})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	check(items)
}

func TestModelOrderRejectsInvalidSnapshotsWithoutPartialWrites(t *testing.T) {
	for _, scenario := range []string{"duplicate", "empty", "missing", "stale", "generation", "deleted", "anonymous", "user"} {
		t.Run(scenario, func(t *testing.T) {
			a, token := modelServer(t)
			items := orderFixture(t, a, 3)
			items[0], items[2] = items[2], items[0]
			status := 409
			switch scenario {
			case "duplicate":
				items[1] = items[0]
				status = 400
			case "empty":
				items = nil
				status = 400
			case "missing":
				items = items[:2]
			case "stale":
				items[0].Version++
			case "generation":
				items[0].CreatedAt = items[0].CreatedAt.Add(-time.Second)
			case "deleted":
				row, _ := a.Store.Get(t.Context(), "models", items[0].ID)
				var model core.Model
				_ = json.Unmarshal(row.Data, &model)
				model.Deleted = true
				row.Data = core.Data(model)
				row, _ = a.Store.Put(t.Context(), "models", row, row.Version)
				items[0].Version = row.Version
			case "anonymous":
				token = ""
				status = 401
			case "user":
				token, _ = a.Sessions.Create(t.Context(), "ordinary", "user")
				status = 403
			}
			before, _ := a.Store.List(t.Context(), "models", "")
			w := call(a, "PUT", "/api/admin/models/order", token, "", map[string]any{"items": items})
			if w.Code != status {
				t.Fatal(w.Code, w.Body.String())
			}
			for _, original := range before {
				row, _ := a.Store.Get(t.Context(), "models", original.ID)
				if row.Version != original.Version || string(row.Data) != string(original.Data) {
					t.Fatal("failed reorder partially committed", row.ID)
				}
			}
		})
	}
}
