package api

import (
	"strings"
	"testing"
)

// Which codes each role holds: the platform none; every provider a 会员
// code; S1 invites for a 分公司; S2 invites for a 分公司 and S1; bind codes
// for providers made in the admin.
func TestProviderCodesFollowRole(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createBranch(t, a, admin, "kinds")
	s1 := createProvider(t, a, admin, "kinds-s1", branch, "S1", "s1", nil)
	s2 := createProvider(t, a, admin, "kinds-s2", s1, "S2", "s2", nil)
	for id, allowed := range map[string]map[string]bool{
		"root": {},
		branch: {"member": true, "s1": true, "s2": true, "bind": true},
		s1:     {"member": true, "s2": true, "bind": true},
		s2:     {"member": true, "bind": true},
	} {
		for _, kind := range []string{"member", "s1", "s2", "bind"} {
			w := call(a, "GET", "/api/admin/partners/"+id+"/codes/"+kind, admin, "", nil)
			if (w.Code == 200) != allowed[kind] || (w.Code != 200 && w.Code != 400) {
				t.Fatal("code availability", id, kind, w.Code, w.Body.String())
			}
		}
	}
	if w := call(a, "GET", "/api/admin/partners/"+branch+"/codes/promo", admin, "", nil); w.Code != 404 {
		t.Fatal("unknown code kind", w.Code)
	}
	// Each kind is its own code.
	seen := map[string]bool{}
	for _, kind := range []string{"member", "s1", "s2", "bind"} {
		seen[providerCode(t, a, "GET", branch, kind, admin).Code] = true
	}
	if len(seen) != 4 {
		t.Fatal("codes collide", seen)
	}
}

func TestMemberCodeStaysUntilResetAndRegistersOverHTTP(t *testing.T) {
	a, one, admin := activationFixture(t)
	two := appUser(t, a, "user-b", "用户乙", "13900000010")
	provider := createProvider(t, a, admin, "share-p", createBranch(t, a, admin, "share"), "S1", "s1", nil)
	first := providerCode(t, a, "GET", provider, "member", admin)
	if again := providerCode(t, a, "GET", provider, "member", admin); again.Code != first.Code {
		t.Fatal("share code changed between reads", first, again)
	}
	join := func(token, code, method string) (int, string) {
		w := call(a, "POST", "/api/access/join", token, "", map[string]string{"code": code, "method": method})
		return w.Code, w.Body.String()
	}
	if code, body := join(one, first.Code, "bogus"); code != 400 {
		t.Fatal("unknown join method", code, body)
	}
	if code, body := join(one, "short", "code"); code != 400 {
		t.Fatal("malformed code", code, body)
	}
	if code, body := join(one, strings.ToLower(first.Code[:4])+"-"+first.Code[4:], "code"); code != 200 || !strings.Contains(body, provider) || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(code, body)
	}
	approve(t, a, "user-a")
	reset := providerCode(t, a, "POST", provider, "member", admin)
	if reset.Code == first.Code {
		t.Fatal("reset kept the old code")
	}
	if current := providerCode(t, a, "GET", provider, "member", admin); current.Code != reset.Code {
		t.Fatal("reset code is not current", current)
	}
	if code, body := join(two, first.Code, "scan"); code != 400 || !strings.Contains(body, "已重置") {
		t.Fatal("old code still joins", code, body)
	}
	if code, body := join(two, reset.Code, "scan"); code != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(code, body)
	}
	if w := call(a, "GET", "/api/templates", one, "", nil); w.Code != 200 {
		t.Fatal("reset dropped an existing member", w.Code, w.Body.String())
	}
	if code, body := join(one, reset.Code, "scan"); code != 400 || !strings.Contains(body, "不能重复登记") {
		t.Fatal("an active member registered again", code, body)
	}
	if w := call(a, "GET", "/api/admin/partners/"+provider+"/codes/member", one, "", nil); w.Code != 403 {
		t.Fatal("user read a share code", w.Code)
	}
}
