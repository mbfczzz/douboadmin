package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
)

func TestFeaturedCatalogSkipsMissingAndForeignResultAssets(t *testing.T) {
	a, _, _, jobs := featuredFixture(t)
	for _, ref := range []string{"asset:missing-result", "asset:foreign-result", "https://fixture.test/ok.png"} {
		j, err := a.Store.CreateJob(t.Context(), core.NewJob("user-a", ref, core.JobInput{Kind: "image"}))
		if err != nil {
			t.Fatal(err)
		}
		claimed, err := a.Store.Claim(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if err = a.Store.Finish(t.Context(), claimed, ref, ""); err != nil {
			t.Fatal(err)
		}
		if _, err = a.Store.Put(t.Context(), "work_meta", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(core.WorkMeta{Featured: true})}, 0); err != nil {
			t.Fatal(err)
		}
	}
	_, err := a.Store.Put(t.Context(), "assets", core.Record{ID: "foreign-result", Owner: "another-user", Data: core.Data(map[string]any{"url": "https://fixture.test/private.png", "type": "image/png"})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	w := call(a, "GET", "/api/featured-works?page=1&size=1", "", "", nil)
	var result struct {
		Total int                `json:"total"`
		Items []featuredWorkView `json:"items"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Total != 1 || len(result.Items) != 1 || result.Items[0].Result != "https://fixture.test/ok.png" {
		t.Fatal("invalid work broke catalog or leaked another user's media", w.Code, w.Body.String(), jobs[0].ID)
	}
}

func TestFeaturedCatalogBeyondMetadataBatchLimitHasNoMissingOrRepeatedRows(t *testing.T) {
	a, _, _, _ := featuredFixture(t)
	for i := 0; i < 105; i++ {
		j, err := a.Store.CreateJob(t.Context(), core.NewJob("user-a", fmt.Sprintf("page-%03d", i), core.JobInput{Kind: "image"}))
		if err != nil {
			t.Fatal(err)
		}
		claimed, err := a.Store.Claim(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if err = a.Store.Finish(t.Context(), claimed, "https://fixture.test/result.png", ""); err != nil {
			t.Fatal(err)
		}
		_, err = a.Store.Put(t.Context(), "work_meta", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(core.WorkMeta{Featured: true})}, 0)
		if err != nil {
			t.Fatal(err)
		}
	}
	seen := map[string]bool{}
	for page := 1; page <= 6; page++ {
		w := call(a, "GET", fmt.Sprintf("/api/featured-works?page=%d", page), "", "", nil)
		var result struct {
			Total int                `json:"total"`
			Items []featuredWorkView `json:"items"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Total != 105 {
			t.Fatal(w.Code, w.Body.String())
		}
		for _, item := range result.Items {
			if seen[item.ID] {
				t.Fatal("duplicate page item", item.ID)
			}
			seen[item.ID] = true
		}
	}
	if len(seen) != 105 {
		t.Fatal("batch cursor omitted items", len(seen))
	}
}

func TestConcurrentFeatureAndDeleteAlwaysLeavesWorkPrivate(t *testing.T) {
	for i := 0; i < 5; i++ {
		a, user, admin, jobs := featuredFixture(t)
		id := jobs[0].ID
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			w := call(a, "PUT", "/api/admin/works/"+id+"/featured", admin, "", map[string]any{"featured": true, "version": 0})
			if w.Code != 200 && w.Code != 409 {
				t.Error(w.Code, w.Body.String())
			}
		}()
		go func() {
			defer wg.Done()
			w := call(a, "DELETE", "/api/works/"+id, user, "", nil)
			if w.Code != 200 {
				t.Error(w.Code, w.Body.String())
			}
		}()
		wg.Wait()
		if w := call(a, "GET", "/api/featured-works/"+id, "", "", nil); w.Code != 404 {
			t.Fatal("deleted work republished", w.Body.String())
		}
	}
}
