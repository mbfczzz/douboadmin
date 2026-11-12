package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

const upstreamCatalog = `[{"id":"image-live","name":"Image Live","modality":"image","credit_cost":2,"operations":["generation","edits"],"params_schema":{"modes":["t2i","i2i"],"aspect":["1:1"],"resolution":["1k"],"quality":["low","high"]}}]`

func modelServer(t *testing.T) (*Server, string) {
	t.Helper()
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" || r.Header.Get("Authorization") != "Bearer secret-catalog" {
			t.Error("unexpected relay request")
		}
		_, _ = w.Write([]byte(upstreamCatalog))
	}))
	t.Cleanup(up.Close)
	a, _, _ := setup(t)
	a.Relay = relay.New(up.URL, "secret-catalog")
	token, _ := a.Sessions.Create(context.Background(), "admin", "admin")
	return a, token
}

func TestSyncUsesRealCatalogAndPreservesOperatorChoices(t *testing.T) {
	a, token := modelServer(t)
	if w := call(a, "POST", "/api/admin/models/sync", "", "", nil); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := call(a, "POST", "/api/admin/models/sync", token, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	id := core.Digest("image-live")[:32]
	row, _ := a.Store.Get(context.Background(), "models", id)
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	if m.Name != "Image Live" || m.CreditCost != 2 || !m.Published {
		t.Fatal(m)
	}
	m.Name = "运营自定义名称"
	m.Published = false
	m.Points = 8
	w := call(a, "PUT", "/api/admin/models/"+id, token, "", map[string]any{"version": row.Version, "data": m})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "PUT", "/api/admin/models/"+id, token, "", map[string]any{"version": row.Version, "data": m}); w.Code != 409 {
		t.Fatal("lost version guard")
	}
	if w = call(a, "POST", "/api/admin/models/sync", token, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	fresh, _ := a.model(context.Background(), id)
	if fresh.Name != m.Name || fresh.Points != 8 || fresh.Published {
		t.Fatal("sync overwrote edits", fresh)
	}
	w = call(a, "GET", "/api/config", "", "", nil)
	var config struct {
		Models []core.Model `json:"models"`
		Demo   bool         `json:"demo"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &config)
	if config.Demo || len(config.Models) != 0 {
		t.Fatal("disabled models leaked into public catalog")
	}
}

func TestConcurrentSyncHasNoDuplicates(t *testing.T) {
	a, token := modelServer(t)
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			w := call(a, "POST", "/api/admin/models/sync", token, "", nil)
			if w.Code != 200 {
				t.Errorf("sync %d", w.Code)
			}
		})
	}
	wg.Wait()
	rows, _ := a.Store.List(context.Background(), "models", "")
	count := 0
	for _, r := range rows {
		if r.ID == core.Digest("image-live")[:32] {
			count++
		}
	}
	if count != 1 {
		t.Fatal("duplicate rows", count)
	}
}

func TestDeletedModelDoesNotReappearOnSync(t *testing.T) {
	a, token := modelServer(t)
	_ = call(a, "POST", "/api/admin/models/sync", token, "", nil)
	id := core.Digest("image-live")[:32]
	row, _ := a.Store.Get(context.Background(), "models", id)
	w := call(a, "DELETE", "/api/admin/models/"+id, token, "", map[string]int64{"version": row.Version})
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	_ = call(a, "POST", "/api/admin/models/sync", token, "", nil)
	m, _ := a.model(context.Background(), id)
	if !m.Deleted || m.Published {
		t.Fatal("deleted model resurrected")
	}
	w = call(a, "POST", "/api/admin/models", token, "", map[string]string{"key": "image-live"})
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	m, _ = a.model(context.Background(), id)
	if m.Deleted || !m.Published {
		t.Fatal("explicit restoration failed")
	}
}

func TestPublishedTemplateRequiresRealModelAndParameters(t *testing.T) {
	a, token := modelServer(t)
	_ = call(a, "POST", "/api/admin/models/sync", token, "", nil)
	tmpl := core.Template{Title: "Real template", Kind: "video", Prompt: "A product video", Cover: "https://example.com/cover.png", Published: true}
	request := func() int {
		return call(a, "PUT", "/api/admin/templates/created", token, "", map[string]any{"version": 0, "data": tmpl}).Code
	}
	if request() != 400 {
		t.Fatal("published without a model")
	}
	tmpl.Model = templateVideoModel(t, a)
	tmpl.Ratio = "1:1"
	tmpl.Resolution = "720p"
	tmpl.Duration = 5
	if request() != 200 {
		t.Fatal("valid template rejected")
	}
	row, _ := a.Store.Get(context.Background(), "templates", "created")
	if call(a, "DELETE", "/api/admin/templates/created", token, "", map[string]int64{"version": row.Version}).Code != 200 {
		t.Fatal("delete failed")
	}
	if call(a, "GET", "/api/templates/created", "", "", nil).Code != 404 {
		t.Fatal("deleted template public")
	}
}
