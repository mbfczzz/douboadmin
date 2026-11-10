package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"doubo/server/internal/core"
	"doubo/server/internal/hotvideo"
)

func TestPreviewDiscoveryDoesNotCallPaidUpstream(t *testing.T) {
	a, user, _ := awaitingBrowser(t, "member")
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); w.WriteHeader(503) }))
	defer upstream.Close()
	a.Hot = &hotvideo.Service{Store: a.Store, Client: &hotvideo.Client{BaseURL: upstream.URL, Key: "test-key"}}
	if w := call(a, "GET", "/api/hot/discovery", user, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/hot/videos?q=test", "/api/hot/videos/123"} {
		if w := call(a, "GET", path, user, "", nil); w.Code != 403 {
			t.Fatal("paid GET was allowed", path, w.Code)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("preview used a paid upstream")
	}
}

func TestPreviewRetainsPrivateRecordOwnershipChecks(t *testing.T) {
	a, user, _ := awaitingBrowser(t, "member")
	j := core.NewJob("user-b", "other-private-job", core.JobInput{Kind: "image", Prompt: "private"})
	if _, e := a.Store.CreateJob(t.Context(), j); e != nil {
		t.Fatal(e)
	}
	for _, ns := range []string{"assets", "orders"} {
		data := core.Data(map[string]string{"url": "https://private.invalid/other-user-secret"})
		if ns == "orders" {
			data = core.Data(core.Order{UserID: "user-b", Status: "created", OpenID: "other-user-secret"})
		}
		if _, e := a.Store.Put(t.Context(), ns, core.Record{ID: "other-private", Owner: "user-b", Data: data}, 0); e != nil {
			t.Fatal(e)
		}
	}
	for _, path := range []string{"/api/jobs/" + j.ID, "/api/assets/other-private", "/api/orders/other-private"} {
		w := call(a, "GET", path, user, "", nil)
		if w.Code == 200 || strings.Contains(w.Body.String(), "other-user-secret") {
			t.Fatal("preview bypassed ownership", path, w.Code)
		}
	}
}

func TestBlockedAccountsDoNotGainPreviewAccess(t *testing.T) {
	for _, state := range []string{"unregistered", "incomplete", "disabled", "rejected"} {
		t.Run(state, func(t *testing.T) {
			a, user, _ := awaitingBrowser(t, "member")
			switch state {
			case "unregistered":
				var err error
				user, err = a.Sessions.Create(t.Context(), "unregistered-user", "user")
				if err != nil {
					t.Fatal(err)
				}
				_, _ = a.Store.Put(t.Context(), "users", core.Record{ID: "unregistered-user", Data: core.Data(registeredProfile("未扫码"))}, 0)
			case "incomplete", "disabled":
				row, _ := a.Store.Get(t.Context(), "users", "user-a")
				var profile map[string]any
				_ = json.Unmarshal(row.Data, &profile)
				if state == "disabled" {
					profile["disabled"] = true
				} else {
					delete(profile, "phone")
				}
				row.Data = core.Data(profile)
				if _, e := a.Store.Put(t.Context(), "users", row, row.Version); e != nil {
					t.Fatal(e)
				}
			case "rejected":
				decide(t, a, "user-a", false, "资料不符")
			}
			if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 {
				t.Fatal("blocked user gained preview", state, w.Code)
			}
			var catalog struct{ Models []core.Model }
			w := call(a, "GET", "/api/config", user, "", nil)
			if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &catalog) != nil || len(catalog.Models) != 0 {
				t.Fatal("blocked user saw catalog", state, w.Code)
			}
		})
	}
}
