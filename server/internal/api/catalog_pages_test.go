package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"testing"
)

func TestCatalogPagingFiltersBeforeSlicing(t *testing.T) {
	a, token, _ := setup(t)
	for i := 0; i < 521; i++ {
		_, e := a.Store.Put(t.Context(), "templates", core.Record{ID: fmt.Sprintf("template-%04d", i), Data: core.Data(core.Template{Title: fmt.Sprintf("template %d", i), Category: "all", GenerationOptions: core.GenerationOptions{Model: "demo-image"}, Published: true, Kind: "image", Sort: i})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	for _, query := range []string{"page=27&size=20", "page=1&size=20&q=template%200"} {
		w := call(a, "GET", "/api/templates?"+query, token, "", nil)
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var page core.RecordPage
		if e := json.Unmarshal(w.Body.Bytes(), &page); e != nil {
			t.Fatal(e)
		}
		if len(page.Items) != 1 {
			t.Fatal(page.Total, len(page.Items))
		}
		if page.Page == 27 && (page.Total != 521 || page.Items[0].ID != "template-0520") {
			t.Fatal(page)
		}
		if page.Page == 1 && page.Items[0].ID != "template-0000" {
			t.Fatal(page)
		}
	}
}

func TestNotificationPagingAndReadAllBeyondFiveHundred(t *testing.T) {
	a, token, _ := setup(t)
	for i := 0; i < 521; i++ {
		_, e := a.Store.Put(t.Context(), "notifications", core.Record{ID: fmt.Sprintf("notice-%04d", i), Owner: "user-a", Data: core.Data(core.Notification{Title: "audit"})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	other, e := a.Store.Put(t.Context(), "notifications", core.Record{ID: "other-user", Owner: "user-b", Data: core.Data(core.Notification{Title: "private"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	w := call(a, "GET", "/api/notifications?page=27&size=20", token, "", nil)
	var page struct {
		Items  []core.Record `json:"items"`
		Total  int           `json:"total"`
		Unread int           `json:"unread"`
	}
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || len(page.Items) != 1 || page.Total != 521 || page.Unread != 521 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "POST", "/api/notifications/read-all", token, "", nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
	w = call(a, "GET", "/api/notifications?page=1", token, "", nil)
	_ = json.Unmarshal(w.Body.Bytes(), &page)
	if page.Unread != 0 {
		t.Fatal(page.Unread)
	}
	row, _ := a.Store.Get(t.Context(), "notifications", other.ID)
	var notice core.Notification
	_ = json.Unmarshal(row.Data, &notice)
	if notice.Read {
		t.Fatal("other user's notification changed")
	}
}

func TestFavoriteStateAndTemplateBeyondListCap(t *testing.T) {
	a, token, _ := setup(t)
	_, e := a.Store.Put(t.Context(), "templates", core.Record{ID: "old-template", Data: core.Data(core.Template{Title: "old", GenerationOptions: core.GenerationOptions{Model: "demo-image"}, Published: true, Kind: "image"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 521; i++ {
		tid := fmt.Sprintf("missing-%04d", i)
		if i == 0 {
			tid = "old-template"
		}
		id := core.Digest("user-a:" + tid)[:32]
		_, e = a.Store.Put(t.Context(), "favorites", core.Record{ID: id, Owner: "user-a", Data: core.Data(map[string]any{"templateId": tid, "active": true})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	w := call(a, "GET", "/api/favorites/old-template", token, "", nil)
	var row core.Record
	if json.Unmarshal(w.Body.Bytes(), &row) != nil || row.Version != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "GET", "/api/favorites/templates?page=1&q=old-template", token, "", nil)
	var page core.RecordPage
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 1 || page.Items[0].ID != "old-template" {
		t.Fatal(w.Code, w.Body.String())
	}
}
