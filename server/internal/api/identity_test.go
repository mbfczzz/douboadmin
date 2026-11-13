package api

import (
	"encoding/json"
	"testing"
)

// bindOwner links a user to an admin-made provider through its bind code.
func bindOwner(t *testing.T, a *Server, partner, user string) {
	t.Helper()
	v, e := a.Partners.Share(t.Context(), partner, "bind", "admin")
	if e != nil {
		t.Fatal(e)
	}
	scan(t, a, user, v.Code)
	approve(t, a, user)
}

// invite registers a user as a provider through a parent's S1/S2 code.
func invite(t *testing.T, a *Server, parent, kind, user string) {
	t.Helper()
	v, e := a.Partners.Share(t.Context(), parent, kind, "admin")
	if e != nil {
		t.Fatal(e)
	}
	scan(t, a, user, v.Code)
	approve(t, a, user)
}

func TestIdentityLabelsEachKindOfUser(t *testing.T) {
	a, _, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createProvider(t, a, admin, "id-branch", "root", "江苏分公司", "branch", nil)
	s1 := createProvider(t, a, admin, "id-s1", branch, "华东", "s1", nil)
	user := func(id, name, phone string) string { return appUser(t, a, id, name, phone) }
	chief, owner, lead := user("chief", "老陈", "13900000001"), user("owner", "老周", "13900000002"), user("lead", "小李", "13900000003")
	boss, fan, waiting := user("boss", "小王", "13900000004"), user("fan", "小张", "13900000005"), user("waiting", "小赵", "13900000006")
	bindOwner(t, a, branch, "chief")
	bindOwner(t, a, s1, "owner")
	invite(t, a, branch, "s1", "lead")
	invite(t, a, s1, "s2", "boss")
	joinPartner(t, a, s1, "fan")
	code, _ := a.Partners.ShareCode(t.Context(), s1, "admin")
	scan(t, a, "waiting", code)
	for token, want := range map[string]identityView{
		chief: {Kind: "branch", Label: "分公司", Partner: "江苏分公司"},
		owner: {Kind: "s1", Label: "S1 服务商", Partner: "华东"},
		lead:  {Kind: "s1", Label: "S1 服务商", Partner: "小李"},
		boss:  {Kind: "s2", Label: "S2 推荐官", Partner: "小王"},
		fan:   {Kind: "member", Label: "会员", Partner: "华东"},
	} {
		var got identityView
		w := call(a, "GET", "/api/me/identity", token, "", nil)
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &got) != nil || got != want {
			t.Fatal(want.Label, w.Code, w.Body.String())
		}
	}
	// Pending users can browse their profile, but have no approved identity.
	var pending identityView
	if w := call(a, "GET", "/api/me/identity", waiting, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &pending) != nil || pending != (identityView{}) {
		t.Fatal("pending user gained an approved identity", w.Code, w.Body.String())
	}
	// Without the activation gate an unopened account has no identity.
	a.Config.RequireActivation = false
	var got identityView
	if w := call(a, "GET", "/api/me/identity", waiting, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &got) != nil || got != (identityView{}) {
		t.Fatal("pending identity", w.Code, w.Body.String())
	}
}
