package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBindCodeLinksS1ToAMiniProgramAccount(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	s1 := createProvider(t, a, admin, "bind-s1", createBranch(t, a, admin, "bind"), "华东", "s1", map[string]string{"username": "bind-s1", "password": "bind-s1-password-2026"})
	path := "/api/admin/partners/" + s1 + "/codes/bind"
	code := providerCode(t, a, "GET", s1, "bind", admin)
	if status, body := joinHTTP(a, user, code.Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(status, body)
	}
	if w := call(a, "GET", path, admin, "", nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"user"`) || !strings.Contains(w.Body.String(), "13800138000") {
		t.Fatal("bound account not shown", w.Body.String())
	}
	// The code works once, even while the first scan waits for approval.
	other := appUser(t, a, "other", "其他人", "13900000009")
	if status, body := joinHTTP(a, other, code.Code); status != 400 || !strings.Contains(body, "已使用") {
		t.Fatal("a used bind code worked again", status, body)
	}
	if w := call(a, "GET", "/api/provider", user, "", nil); w.Code != 403 {
		t.Fatal("a pending owner opened the provider center", w.Code)
	}
	approve(t, a, "user-a")
	var id identityView
	if w := call(a, "GET", "/api/me/identity", user, "", nil); json.Unmarshal(w.Body.Bytes(), &id) != nil || id.Kind != "s1" || id.Partner != "华东" {
		t.Fatal(w.Body.String())
	}
	// The platform keeps S1's login; the mini-program cannot reset it.
	if w := call(a, "POST", "/api/provider/password", user, "", nil); w.Code != 403 {
		t.Fatal("bound S1 reset its admin password", w.Code)
	}
	if w := call(a, "GET", "/api/provider", user, "", nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"owner":false`) || !strings.Contains(w.Body.String(), `"account":"bind-s1"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	var fresh shareView
	if w := call(a, "DELETE", path, admin, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &fresh) != nil || fresh.Code == "" || fresh.Code == code.Code {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/provider", user, "", nil); w.Code != 403 {
		t.Fatal("unbound user still opens the provider center", w.Code, w.Body.String())
	}
	if w := call(a, "DELETE", path, admin, "", nil); w.Code != 400 {
		t.Fatal("unbound twice", w.Code, w.Body.String())
	}
}

func TestRejectedBindFreesTheProviderWithANewCode(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	branch := createBranch(t, a, admin, "rebind")
	code := providerCode(t, a, "GET", branch, "bind", admin)
	if status, body := joinHTTP(a, user, code.Code); status != 200 {
		t.Fatal(status, body)
	}
	if status, body := decideHTTP(t, a, admin, "user-a", false, "x"); status != 400 || !strings.Contains(body, "拒绝原因") {
		t.Fatal("rejected without a reason", status, body)
	}
	if status, body := decideHTTP(t, a, admin, "user-a", false, "不是该分公司负责人"); status != 200 || !strings.Contains(body, `"status":"rejected"`) {
		t.Fatal(status, body)
	}
	fresh := providerCode(t, a, "GET", branch, "bind", admin)
	if fresh.Code == code.Code {
		t.Fatal("rejection kept the used bind code")
	}
	if _, e := a.Partners.OwnedPartner(t.Context(), "user-a"); e == nil {
		t.Fatal("rejected user still owns the provider")
	}
	// The rejected user (or anyone) may scan the new code.
	if status, body := joinHTTP(a, user, code.Code); status != 400 {
		t.Fatal("old bind code still works", status, body)
	}
	if status, body := joinHTTP(a, user, fresh.Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(status, body)
	}
	approve(t, a, "user-a")
	if id, e := a.Partners.OwnedPartner(t.Context(), "user-a"); e != nil || id != branch {
		t.Fatal(id, e)
	}
}

func TestScannedProviderHasNoBindCode(t *testing.T) {
	a, _, admin := activationFixture(t)
	branch := newBranch(t, a, "nobind")
	appUser(t, a, "lead", "小李", "13900000008")
	invite(t, a, branch, "s1", "lead")
	id, e := a.Partners.OwnedPartner(t.Context(), "lead")
	if e != nil {
		t.Fatal(e)
	}
	if w := call(a, "GET", "/api/admin/partners/"+id+"/codes/bind", admin, "", nil); w.Code != 400 || !strings.Contains(w.Body.String(), "无需绑定") {
		t.Fatal("a scanned provider got a bind code", w.Code, w.Body.String())
	}
}

// Unbinding a pending bind leaves nothing for a later approval to restore.
func TestUnbindWhilePendingClosesTheRegistration(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	branch := newBranch(t, a, "unbind-pending")
	code := providerCode(t, a, "GET", branch, "bind", admin)
	if status, body := joinHTTP(a, user, code.Code); status != 200 {
		t.Fatal(status, body)
	}
	if w := call(a, "DELETE", "/api/admin/partners/"+branch+"/codes/bind", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	// The pending registration leaves the review list as rejected.
	if status, body := decideHTTP(t, a, admin, "user-a", true, ""); status != 400 || !strings.Contains(body, "已处理") {
		t.Fatal("approval re-linked an unbound user", status, body)
	}
	if _, e := a.Partners.OwnedPartner(t.Context(), "user-a"); e == nil {
		t.Fatal("unbound user owns the provider")
	}
}
