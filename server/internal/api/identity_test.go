package api

import (
	"doubo/server/internal/core"
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
		owner: {Kind: "s1", Label: "一级服务商", Partner: "华东"},
		lead:  {Kind: "s1", Label: "一级服务商", Partner: "小李"},
		boss:  {Kind: "s2", Label: "二级服务商", Partner: "小王"},
		fan:   {Kind: "member", Label: "合伙人", Partner: "华东"},
	} {
		var got identityView
		w := call(a, "GET", "/api/me/identity", token, "", nil)
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &got) != nil || got != want {
			t.Fatal(want.Label, w.Code, w.Body.String())
		}
	}
	// Visitors may read the page; they show as 游客, not a business role.
	visitor := identityView{Kind: core.RoleVisitor, Label: "游客"}
	var pending identityView
	if w := call(a, "GET", "/api/me/identity", waiting, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &pending) != nil || pending != visitor {
		t.Fatal("visitor badge", w.Code, w.Body.String())
	}
	// Ordinary direct registration also stays a visitor until it is approved.
	direct := user("direct-waiting", "小林", "13900000007")
	if _, err := a.Partners.RegisterDirectVisitor(t.Context(), "direct-waiting"); err != nil {
		t.Fatal(err)
	}
	var directVisitor identityView
	if w := call(a, "GET", "/api/me/identity", direct, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &directVisitor) != nil || directVisitor != visitor {
		t.Fatal("direct visitor badge", w.Code, w.Body.String())
	}
	// An administrator-managed visitor gets the same badge without inheriting
	// the previous member label or provider menu.
	assignment, err := a.Partners.IdentityAssignment(t.Context(), "fan")
	if err != nil {
		t.Fatal(err)
	}
	managed, err := a.Partners.ChangeIdentity(t.Context(), "fan", core.RoleVisitor, "", "admin", assignment.Version)
	if err != nil {
		t.Fatal(err)
	}
	var managedVisitor identityView
	if w := call(a, "GET", "/api/me/identity", fan, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &managedVisitor) != nil || managedVisitor != visitor {
		t.Fatal("managed visitor badge", w.Code, w.Body.String())
	}
	if _, err = a.Partners.ChangeIdentity(t.Context(), "fan", core.RoleMember, s1, "admin", managed.Version); err != nil {
		t.Fatal(err)
	}
	// Without the activation gate an unopened account is still a 游客.
	a.Config.RequireActivation = false
	var got identityView
	if w := call(a, "GET", "/api/me/identity", waiting, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &got) != nil || got != visitor {
		t.Fatal("pending identity", w.Code, w.Body.String())
	}
	// A member whose provider is stopped gets no badge rather than 游客.
	row, _ := a.Store.Get(t.Context(), "partners", s1)
	var stopped core.Partner
	_ = json.Unmarshal(row.Data, &stopped)
	stopped.Status = "disabled"
	row.Data = core.Data(stopped)
	if _, e := a.Store.Put(t.Context(), "partners", row, row.Version); e != nil {
		t.Fatal(e)
	}
	var none identityView
	if w := call(a, "GET", "/api/me/identity", fan, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &none) != nil || none != (identityView{}) {
		t.Fatal("stopped provider member", w.Code, w.Body.String())
	}
}
