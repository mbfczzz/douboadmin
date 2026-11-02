package api

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"encoding/base64"
	"encoding/json"
	"image/png"
	"strings"
	"testing"
)

func activationFixture(t *testing.T) (*Server, string, string) {
	t.Helper()
	a, user, _ := setup(t)
	a.Config.RequireActivation = true
	a.Billing.RequireActivation = true
	_, _ = a.Store.Put(context.Background(), "users", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(map[string]string{"nickname": "test"})}, 0)
	admin, e := a.Sessions.Create(context.Background(), "admin", "admin")
	if e != nil {
		t.Fatal(e)
	}
	return a, user, admin
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
	code, e := a.Partners.Issue(context.Background(), core.RootPartner, "api activation", 7, "api-activation", "admin")
	if e != nil {
		t.Fatal(e)
	}
	w := call(a, "GET", "/api/admin/activation-codes/"+code.ID, admin, "", nil)
	var grant struct {
		Code string `json:"code"`
		QR   string `json:"qr"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &grant) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	image, e := base64.StdEncoding.DecodeString(strings.TrimPrefix(grant.QR, "data:image/png;base64,"))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = png.Decode(bytes.NewReader(image)); e != nil {
		t.Fatal("invalid QR PNG", e)
	}
	w = call(a, "POST", "/api/access/redeem", user, "", map[string]string{"code": "DOUBO-ACTIVATE:" + grant.Code})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "GET", "/api/config", user, "", nil)
	if !strings.Contains(w.Body.String(), "demo-image") {
		t.Fatal("activated catalog missing")
	}
	row, _ := a.Store.Get(context.Background(), "memberships", "user-a")
	if _, e = a.Partners.ChangeMembership(context.Background(), "user-a", "disabled", "测试停用", "admin", row.Version); e != nil {
		t.Fatal(e)
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 {
		t.Fatal("cached session bypassed revocation")
	}
	if w = call(a, "POST", "/api/auth/logout", user, "", nil); w.Code != 200 {
		t.Fatal("inactive user could not logout")
	}
}
