package api

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestAllScannedIdentitiesCanBrowseWhileAwaitingApproval(t *testing.T) {
	for _, kind := range []string{"member", "s1", "s2", "bind", "promo"} {
		t.Run(kind, func(t *testing.T) {
			a, user, _ := awaitingBrowser(t, kind)
			v := accessOf(t, a, user)
			if v.Active || !v.CanBrowse || v.ProfileRequired {
				t.Fatal("wrong pending permissions", v)
			}
			for _, path := range []string{
				"/api/templates?page=1&size=4", "/api/templates/visible-template", "/api/me", "/api/me/identity",
				"/api/jobs?page=1", "/api/works?page=1", "/api/wallet", "/api/wallet/ledger", "/api/orders", "/api/preferences", "/api/notifications",
			} {
				if w := call(a, "GET", path, user, "", nil); w.Code != 200 {
					t.Fatal("read blocked", path, w.Code, w.Body.String())
				}
			}
			config := call(a, "GET", "/api/config", user, "", nil)
			if config.Code != 200 || !strings.Contains(config.Body.String(), "demo-image") || strings.Contains(config.Body.String(), "9.999") {
				t.Fatal("preview catalog missing or exposes internal costs", config.Body.String())
			}
			catalog := call(a, "GET", "/api/templates", user, "", nil)
			if !strings.Contains(catalog.Body.String(), "可浏览模板") || strings.Contains(catalog.Body.String(), "内部未上架") {
				t.Fatal("incorrect preview templates", catalog.Body.String())
			}
			if w := call(a, "GET", "/api/templates/hidden-template", user, "", nil); w.Code != 404 {
				t.Fatal("hidden template exposed", w.Code)
			}
			assertEstimate(t, a, user, core.JobInput{Kind: "image", Model: "demo-image", Resolution: "1K", Ratio: "1:1"}, 200, true)
		})
	}
}

func TestReadOnlyBrowserCannotUseWriteOrPaidOperations(t *testing.T) {
	a, user, _ := awaitingBrowser(t, "member")
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "test", Resolution: "1K", Ratio: "1:1"}
	for _, check := range []struct{ method, path string }{
		{"POST", "/api/jobs"}, {"POST", "/api/jobs/quote"}, {"POST", "/api/jobs/any/retry"},
		{"POST", "/api/assets"}, {"POST", "/api/orders"}, {"POST", "/api/orders/any/pay"}, {"POST", "/api/orders/any/refresh"},
		{"POST", "/api/shares"}, {"PUT", "/api/favorites/any"}, {"PUT", "/api/me"}, {"PUT", "/api/preferences"},
		{"POST", "/api/feedback"}, {"POST", "/api/notifications/read-all"}, {"DELETE", "/api/works/any"},
		{"GET", "/api/provider"}, {"GET", "/api/promo"}, {"POST", "/api/provider/password"},
		{"GET", "/api/hot/videos?q=test"}, {"GET", "/api/hot/videos/123"}, {"POST", "/api/hot/videos/123/import"},
	} {
		w := call(a, check.method, check.path, user, "readonly-test-command", in)
		var denied struct {
			Code   string
			Access accessView
		}
		if w.Code != 403 || json.Unmarshal(w.Body.Bytes(), &denied) != nil || denied.Code != "ACTIVATION_REQUIRED" || denied.Access.Active || !denied.Access.CanBrowse {
			t.Fatal("read-only operation did not fail closed", check, w.Code, w.Body.String())
		}
	}
	for _, ns := range []string{"orders", "assets", "shares", "favorites", "wallet_ledger"} {
		rows, e := a.Store.List(t.Context(), ns, "user-a")
		if e != nil || len(rows) != 0 {
			t.Fatal("blocked operation changed state", ns, e)
		}
	}
	job := core.NewJob("user-a", "transactional-preview", in)
	job.ActivationRequired = true
	if _, e := a.Store.CreateJob(t.Context(), job); !errors.Is(e, core.ErrActivationRequired) {
		t.Fatal("transactional generation admitted a preview user", e)
	}
	if jobs, e := a.Store.Jobs(t.Context(), "user-a"); e != nil || len(jobs) != 0 {
		t.Fatal("preview created a job", e)
	}
	var wallet struct{ PaymentReady bool }
	_ = json.Unmarshal(call(a, "GET", "/api/wallet", user, "", nil).Body.Bytes(), &wallet)
	if wallet.PaymentReady {
		t.Fatal("preview wallet offers payment")
	}
	approve(t, a, "user-a")
	if v := accessOf(t, a, user); !v.Active || !v.CanBrowse {
		t.Fatal("approval did not upgrade access", v)
	}
	if w := call(a, "POST", "/api/jobs/quote", user, "", in); w.Code != 200 {
		t.Fatal("approval did not unlock operations", w.Code, w.Body.String())
	}
}
