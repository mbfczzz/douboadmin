package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestActivationTraceUsesSessionAccountAndIsAdminOnly(t *testing.T) {
	a, user, _ := setup(t)
	ctx := context.Background()
	a.Config.AdminUser = "verified-account"
	login := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "verified-account", "password": "test-pass"})
	if login.Code != 200 {
		t.Fatal(login.Body.String())
	}
	admin := login.Result().Cookies()[0].Value
	a.Config.AdminUser = "renamed-configuration"
	created := call(a, "POST", "/api/admin/activation-codes", admin, "trace-api-key", map[string]any{"partnerId": "root", "label": "trace", "days": 7})
	var row core.Record
	if created.Code != 200 || json.Unmarshal(created.Body.Bytes(), &row) != nil {
		t.Fatal(created.Code, created.Body.String())
	}
	var grant core.ActivationCode
	_ = json.Unmarshal(row.Data, &grant)
	if grant.CreatorAccount != "verified-account" || grant.Actor == "" {
		t.Fatal("issuer came from mutable config instead of session", grant)
	}
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Data: core.Data(map[string]string{"nickname": "激活用户", "phone": "private-phone", "openid": "private-openid"})}, 0)
	code, e := a.Partners.Reveal(ctx, row.ID)
	if e != nil {
		t.Fatal(e)
	}
	if w := call(a, "POST", "/api/access/redeem", user, "", map[string]string{"code": code, "method": "qr"}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	path := "/api/admin/activation-codes/" + row.ID + "/trace"
	if w := call(a, "GET", path, user, "", nil); w.Code != 403 {
		t.Fatal("user read issuer records", w.Code)
	}
	if w := call(a, "GET", path, "", "", nil); w.Code != 401 {
		t.Fatal(w.Code)
	}
	w := call(a, "GET", path, admin, "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "verified-account") || !strings.Contains(w.Body.String(), "激活用户") {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, secret := range []string{code, "private-phone", "private-openid", "codeKey"} {
		if strings.Contains(w.Body.String(), secret) {
			t.Fatal("trace exposed secret", secret)
		}
	}
	if w = call(a, "POST", "/api/admin/activation-codes", admin, "spoof-actor-key", map[string]any{"partnerId": "root", "label": "bad", "days": 7, "creatorAccount": "spoofed"}); w.Code != 400 {
		t.Fatal("client forged issuer", w.Code)
	}
}
