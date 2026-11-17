package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync/atomic"
	"testing"
)

// 豆播 keeps its own model names: sync matches by upstream ID and only
// names models it has not seen before.
func TestSyncKeepsLocalNamesByUpstreamIDDespiteReorderedCatalog(t *testing.T) {
	var catalog atomic.Value
	catalog.Store(`[{"id":"name-a","name":"同名模型","modality":"image"},{"id":"name-b","name":"同名模型","modality":"image"}]`)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/managed/v1/models" || r.Header.Get("Authorization") != "Bearer fixture-key" {
			t.Error("unexpected upstream catalog request")
		}
		_, _ = w.Write([]byte(catalog.Load().(string)))
	}))
	defer upstream.Close()
	a, _, _ := setup(t)
	a.Relay = relay.New(upstream.URL+"/managed", "fixture-key")
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	sync := func(created, updated int) {
		t.Helper()
		w := call(a, "POST", "/api/admin/models/sync", admin, "", nil)
		var result map[string]int
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || result["created"] != created || result["updated"] != updated || result["conflicts"] != 0 {
			t.Fatal("unexpected sync counts", w.Code, w.Body.String())
		}
	}
	sync(2, 0)
	idA, idB := core.Digest("name-a")[:32], core.Digest("name-b")[:32]
	row, err := a.Store.Get(t.Context(), "models", idA)
	if err != nil {
		t.Fatal(err)
	}
	var edited core.Model
	if json.Unmarshal(row.Data, &edited) != nil {
		t.Fatal("invalid stored model")
	}
	edited.Name, edited.Points, edited.Sort, edited.Published = "本地自定义名称", 18.25, 17, false
	edited.Settings = core.ModelSettings{HideQuality: true, HideResolution: true, MaxPromptChars: 3000,
		DefaultPrompt: "保留提示词", PriceMatrix: map[string]map[string]float64{"high": {"4k": 27.5}}}
	row.Data = core.Data(edited)
	row, err = a.Store.Put(t.Context(), "models", row, row.Version)
	if err != nil {
		t.Fatal(err)
	}
	catalog.Store(`[{"id":"name-b","name":"新名称 B","modality":"image"},{"id":"name-a","name":"新名称 A","modality":"image"}]`)
	sync(0, 2)
	fresh, err := a.Store.Get(t.Context(), "models", idA)
	var model core.Model
	if err != nil || json.Unmarshal(fresh.Data, &model) != nil || fresh.Version != row.Version+1 || model.Name != "本地自定义名称" || model.ID != idA || model.Key != edited.Key {
		t.Fatal("sync renamed the model after the relay", fresh, err)
	}
	if model.Points != edited.Points || model.Sort != edited.Sort || model.Published || model.Deleted || !reflect.DeepEqual(model.Settings, edited.Settings) {
		t.Fatal("sync altered operator configuration", model)
	}
	w := call(a, "GET", "/api/config", "", "", nil)
	var public struct {
		Models []core.Model `json:"models"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &public) != nil || len(public.Models) != 1 || public.Models[0].ID != idB || public.Models[0].Name != "同名模型" {
		t.Fatal("miniapp catalog shows the relay's new name", w.Body.String())
	}
	// A model first seen without an upstream name is named by its ID.
	catalog.Store(`[{"id":"name-a","modality":"image"},{"id":"name-c","modality":"image"}]`)
	sync(1, 1)
	if model, err = a.model(t.Context(), idA); err != nil || model.Name != "本地自定义名称" {
		t.Fatal("missing upstream name replaced the local name", model.Name, err)
	}
	if model, err = a.model(t.Context(), core.Digest("name-c")[:32]); err != nil || model.Name != "name-c" {
		t.Fatal("new model without a name did not use its ID", model.Name, err)
	}
}
