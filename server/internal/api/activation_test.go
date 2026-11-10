package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func activationFixture(t *testing.T) (*Server, string, string) {
	t.Helper()
	a, user, _ := setup(t)
	a.Config.RequireActivation = true
	a.Config.DemoLogin = true // SMS codes are shown instead of sent
	a.Billing.RequireActivation = true
	_, _ = a.Store.Put(context.Background(), "users", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(registeredProfile("test"))}, 0)
	admin, e := a.Sessions.Create(context.Background(), "admin", "admin")
	if e != nil {
		t.Fatal(e)
	}
	return a, user, admin
}

// registeredProfile is a user who finished the SMS registration step.
func registeredProfile(nickname string) map[string]string {
	return map[string]string{"nickname": nickname, "name": "测试用户", "phone": "13800138000", "verifiedPhone": "13800138000"}
}

func TestWechatIdentityAloneCannotUseBusinessEndpoints(t *testing.T) {
	a, user, admin := activationFixture(t)
	for _, path := range []string{"/api/templates", "/api/hot/discovery", "/api/jobs", "/api/wallet", "/api/me", "/api/shares/123"} {
		w := call(a, "GET", path, user, "", nil)
		if w.Code != 403 || !strings.Contains(w.Body.String(), "ACTIVATION_REQUIRED") {
			t.Fatalf("ungated endpoint %s: %d %s", path, w.Code, w.Body.String())
		}
	}
	for _, token := range []string{"", user} {
		w := call(a, "GET", "/api/config", token, "", nil)
		var c struct {
			Models []core.Model `json:"models"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &c)
		if w.Code != 200 || len(c.Models) != 0 {
			t.Fatal("catalog leak", w.Code, w.Body.String())
		}
	}
	if w := call(a, "GET", "/api/access", user, "", nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := call(a, "GET", "/api/admin/partners", user, "", nil); w.Code != 403 {
		t.Fatal("user accessed partner management")
	}
	if w := call(a, "GET", "/api/admin/partners/root/codes/member", admin, "", nil); w.Code != 400 {
		t.Fatal("the platform got a member code", w.Code, w.Body.String())
	}
	share := providerCode(t, a, "GET", newBranch(t, a, "gate"), "member", admin)
	if !strings.HasPrefix(share.QR, "data:image/png;base64,") {
		t.Fatal("share QR missing", share)
	}
	// The QR carries the prefixed code, as the mini-program scanner reads it.
	// Scanning only registers: the account waits for the platform.
	if code, body := joinHTTP(a, user, share.Code); code != 200 || !strings.Contains(body, `"status":"review"`) || !strings.Contains(body, `"active":false`) {
		t.Fatal(code, body)
	}
	if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("pending registration could not browse", w.Code, w.Body.String())
	}
	if w := call(a, "POST", "/api/jobs", user, "", map[string]any{}); w.Code != 403 || !strings.Contains(w.Body.String(), "等待上级开通") {
		t.Fatal("pending registration gained generation access", w.Code, w.Body.String())
	}
	approve(t, a, "user-a")
	if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w := call(a, "GET", "/api/config", user, "", nil)
	if !strings.Contains(w.Body.String(), "demo-image") {
		t.Fatal("activated catalog missing")
	}
	row, _ := a.Store.Get(context.Background(), "memberships", "user-a")
	if w = call(a, "PUT", "/api/admin/memberships/user-a", admin, "", map[string]any{"status": "disabled", "reason": "测试停用", "version": row.Version}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 {
		t.Fatal("cached session bypassed revocation")
	}
	if w = call(a, "POST", "/api/auth/logout", user, "", nil); w.Code != 200 {
		t.Fatal("inactive user could not logout")
	}
}
