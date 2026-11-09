package api

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVisitEndpoint(t *testing.T) {
	a, user, _ := setup(t)
	good := map[string]any{"visitId": "visit-0123456789ab", "visitorId": "visitor-0123456789", "page": "pages/create/index", "scene": 1001, "platform": "android"}
	// Public and anonymous: no token needed, and a token is not linked.
	if w := call(a, "POST", "/api/visits", "", "", good); w.Code != 204 {
		t.Fatal("anonymous visit", w.Code, w.Body.String())
	}
	if w := call(a, "POST", "/api/visits", user, "", good); w.Code != 204 {
		t.Fatal("visit with token", w.Code)
	}
	rows, _ := a.Store.List(context.Background(), "visits", "")
	if len(rows) != 1 || rows[0].Owner != "" {
		t.Fatal("visit must be stored once without an owner", rows)
	}
	for name, body := range map[string]any{
		"bad page":      map[string]any{"visitId": "visit-0123456789ab", "visitorId": "visitor-0123456789", "page": "../admin", "scene": 1001},
		"short visitor": map[string]any{"visitId": "visit-0123456789ab", "visitorId": "v1", "page": "pages/create/index"},
		"unknown field": map[string]any{"visitId": "visit-0123456789ab", "visitorId": "visitor-0123456789", "page": "pages/create/index", "userId": "user-a"},
		"scene type":    map[string]any{"visitId": "visit-0123456789ab", "visitorId": "visitor-0123456789", "page": "pages/create/index", "scene": "1001"},
	} {
		if w := call(a, "POST", "/api/visits", "", "", body); w.Code != 400 {
			t.Fatal(name, w.Code)
		}
	}
	r := httptest.NewRequest("POST", "/api/visits", bytes.NewReader([]byte(`{"visitId":"`+strings.Repeat("a", 2000)+`"}`)))
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatal("oversized body", w.Code)
	}
}

func TestVisitBeaconsAreThrottledPerIP(t *testing.T) {
	var l visitLimit
	now := time.Now()
	for i := range visitsPerMinute {
		if !l.allow("1.2.3.4", now) {
			t.Fatal("refused early", i)
		}
	}
	if l.allow("1.2.3.4", now) || !l.allow("5.6.7.8", now) || !l.allow("1.2.3.4", now.Add(time.Minute)) {
		t.Fatal("limit is per IP and per minute")
	}
}

func TestSharePageCountsAnonymousWebVisit(t *testing.T) {
	a, _, _ := setup(t)
	ctx := context.Background()
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Data: core.Data(map[string]any{"disabled": false})}, 0)
	j := core.NewJob("user-a", "web-visit", core.JobInput{Kind: "image", Prompt: "p", Model: "demo-image"})
	_, _ = a.Store.CreateJob(ctx, j)
	claimed, _ := a.Store.Claim(ctx)
	_ = a.Store.Finish(ctx, claimed, "https://cdn.example/x.png", "")
	user, _ := a.Sessions.Create(ctx, "user-a", "user")
	var share struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(call(a, "POST", "/api/shares", user, "", map[string]any{"jobId": j.ID}).Body.Bytes(), &share)
	open := func(ua string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/s/"+share.Token+"?utm_source=weibo", nil)
		r.Header.Set("User-Agent", ua)
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		return w
	}
	if w := open("Mozilla/5.0 (iPhone) MicroMessenger"); w.Code != 200 || len(w.Result().Cookies()) != 2 {
		t.Fatal("share page should set the visitor and visit cookies", w.Code, w.Result().Cookies())
	}
	open("Googlebot/2.1") // crawlers are not visitors
	for range 50 {
		if rows, _ := a.Store.List(ctx, "visits", ""); len(rows) > 0 {
			var v core.Visit
			_ = json.Unmarshal(rows[0].Data, &v)
			if len(rows) != 1 || v.Client != "web" || v.Entry != "/s/*" || v.Source != "weibo" || v.Platform != "ios" {
				t.Fatalf("visit %+v (%d rows)", v, len(rows))
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("share page view not recorded")
}
