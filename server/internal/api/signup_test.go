package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestOpenSignupAllowsDirectUsersWithoutChangingInviteFlow(t *testing.T) {
	a, user, admin := activationFixture(t)
	var setting core.Record
	w := call(a, "GET", "/api/admin/signup", admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &setting) != nil || strings.Contains(string(setting.Data), `"openSignup":true`) {
		t.Fatal("open signup must default closed", w.Code, w.Body.String())
	}
	if access := accessOf(t, a, user); access.OpenSignup || access.Active || access.CanBrowse {
		t.Fatal("default signup exposed access", access)
	}
	if w = call(a, "PUT", "/api/admin/signup", user, "", map[string]any{"version": 0, "openSignup": true}); w.Code != 403 {
		t.Fatal("user changed signup policy", w.Code, w.Body.String())
	}
	if w = call(a, "POST", "/api/access/direct", user, "", map[string]any{}); w.Code != 403 {
		t.Fatal("closed signup admitted a direct user", w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "direct_access", "user-a"); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("closed signup wrote a direct grant", err)
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 {
		t.Fatal("closed signup allowed business access", w.Code, w.Body.String())
	}
	w = call(a, "PUT", "/api/admin/signup", admin, "", map[string]any{"version": 0, "openSignup": true})
	if w.Code != 200 {
		t.Fatal("super admin could not open signup", w.Code, w.Body.String())
	}
	if v := accessOf(t, a, user); !v.OpenSignup || v.Active {
		t.Fatal("signup setting not exposed", v)
	}
	w = call(a, "POST", "/api/access/direct", user, "", map[string]any{})
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"direct"`) {
		t.Fatal("direct registration failed", w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("direct user blocked from business", w.Code, w.Body.String())
	}
	job := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "direct signup", Resolution: "1K", Ratio: "1:1", Assets: []string{}}
	if w = call(a, "POST", "/api/jobs", user, "direct-signup-job", job); w.Code != 202 {
		t.Fatal("direct user blocked by the storage billing guard", w.Code, w.Body.String())
	}
	source, err := a.Partners.Source(t.Context(), "user-a")
	if err != nil || source.Kind != "direct" || source.DirectAt == nil {
		t.Fatal("direct source missing", source, err)
	}
	page, err := a.Store.UserPage(t.Context(), core.UserQuery{Access: "direct", Page: 1, Size: 20})
	if err != nil || page.Total != 1 || page.Items[0].ID != "user-a" {
		t.Fatal("direct user filter failed", page, err)
	}
}

func TestPendingInviteCannotBeBypassedByOpenSignup(t *testing.T) {
	a, _, admin := activationFixture(t)
	if w := call(a, "PUT", "/api/admin/signup", admin, "", map[string]any{"version": 0, "openSignup": true}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	user := newMiniUser(t, a, "invite-first")
	row, _ := a.Store.Get(t.Context(), "users", "invite-first")
	row.Data = core.Data(registeredProfile("invite-first"))
	if _, err := a.Store.Put(t.Context(), "users", row, row.Version); err != nil {
		t.Fatal(err)
	}
	branch := newBranch(t, a, "invite-first")
	share := providerCode(t, a, "GET", branch, "member", admin)
	if code, body := joinHTTP(a, user, share.Code); code != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(code, body)
	}
	w := call(a, "POST", "/api/access/direct", user, "", map[string]any{})
	if w.Code == 200 || !strings.Contains(w.Body.String(), "待审核") {
		t.Fatal("pending invite was bypassed", w.Code, w.Body.String())
	}
}
