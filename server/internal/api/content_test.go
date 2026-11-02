package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReviewShareDeleteAndNotificationOwnership(t *testing.T) {
	a, user, other := setup(t)
	ctx := context.Background()
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Data: core.Data(map[string]any{"disabled": false})}, 0)
	admin, _ := a.Sessions.Create(ctx, "admin", "admin")
	j := core.NewJob("user-a", "content-fixture", core.JobInput{Kind: "image", Model: "demo-image", Prompt: "private description"})
	_, _ = a.Store.CreateJob(ctx, j)
	claimed, _ := a.Store.Claim(ctx)
	if e := a.Store.Finish(ctx, claimed, "https://cdn.example/image.png", ""); e != nil {
		t.Fatal(e)
	}
	share := map[string]any{"jobId": j.ID, "title": "我的作品", "showPrompt": false}
	if w := call(a, "POST", "/api/shares", other, "", share); w.Code != 404 {
		t.Fatal("other user shared work", w.Code)
	}
	if w := call(a, "POST", "/api/shares", user, "", share); w.Code != 409 {
		t.Fatal("unreviewed share allowed", w.Code)
	}
	review, _ := a.Store.Get(ctx, "reviews", j.ID)
	w := call(a, "PUT", "/api/admin/reviews/"+j.ID, admin, "", map[string]any{"version": review.Version, "status": "approved", "reason": "checked"})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = call(a, "POST", "/api/shares", user, "", share)
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	var data struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &data)
	w = call(a, "GET", "/api/shares/"+data.Token, "", "", nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), "private description") {
		t.Fatal("share exposed prompt or failed", w.Body.String())
	}
	html := httptest.NewRecorder()
	a.Handler().ServeHTTP(html, httptest.NewRequest("GET", "/s/"+data.Token, nil))
	if html.Code != 200 || !strings.Contains(html.Body.String(), "我的作品") {
		t.Fatal("short link unavailable")
	}
	notices, _ := a.Store.List(ctx, "notifications", "user-a")
	if len(notices) < 2 {
		t.Fatal("completion/review notifications missing")
	}
	if w = call(a, "PUT", "/api/notifications/"+notices[0].ID+"/read", other, "", nil); w.Code != 404 {
		t.Fatal("cross-user notification access")
	}
	if w = call(a, "DELETE", "/api/works/"+j.ID, user, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "GET", "/api/shares/"+data.Token, "", "", nil); w.Code != 404 {
		t.Fatal("deleted share remained public")
	}
}
