package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func phoneBranch(t *testing.T, a *Server, super, phone, key string, account bool) core.Record {
	t.Helper()
	body := map[string]any{"name": "测试分公司", "role": "branch", "parentId": "root", "phone": phone}
	if account {
		body["account"] = map[string]string{"username": key, "password": "Tester12", "role": "branch"}
	}
	w := call(a, "POST", "/api/admin/partners", super, "branch-phone-"+key, body)
	var row core.Record
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &row) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return row
}

func TestVerifiedBranchPhoneSkipsScanAndKeepsChildren(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := phoneBranch(t, a, super, "13900139000", "phone-branch", true)
	child, e := a.Partners.Create(t.Context(), branch.ID, "已有下级服务商", "s1", "child-before-login", "fixture")
	if e != nil {
		t.Fatal(e)
	}
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "phone-proof"})
	var session struct{ UserID, Token string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	access := accessOf(t, a, session.Token)
	if !access.Active || access.ProfileRequired || access.PartnerID != branch.ID || access.Status != "provider" {
		t.Fatal(access)
	}
	w = call(a, "GET", "/api/me/identity", session.Token, "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"kind":"branch"`) || !strings.Contains(w.Body.String(), "分公司") {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "GET", "/api/provider/children", session.Token, "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), child.ID) {
		t.Fatal("missing existing descendants", w.Code, w.Body.String())
	}
	row, account, found, e := a.providerAccount(t.Context(), branch.ID)
	if e != nil || !found || account.UserID != session.UserID || account.Phone != "13900139000" {
		t.Fatal("backend not linked", e)
	}
	if w = call(a, "GET", "/api/admin/me", session.Token, "", nil); w.Code != 403 {
		t.Fatal("mini token granted admin")
	}
	// Repeated proof never duplicates relations or resets backend credentials.
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "again", "phoneCode": "proof"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	after, _, _, _ := a.providerAccount(t.Context(), branch.ID)
	if after.Version != row.Version {
		t.Fatal("repeat login changed backend account")
	}
	if _, e = a.Partners.Unbind(t.Context(), branch.ID, "admin"); e != nil {
		t.Fatal(e)
	}
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "after-unbind", "phoneCode": "proof"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if access := accessOf(t, a, session.Token); access.Active {
		t.Fatal("login undid admin unbind")
	}
}

func TestBranchPhoneRequiresVerifiedOwnershipEvenWhenSMSProfileDisabled(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := phoneBranch(t, a, super, "13900139000", "proof-only", false)
	off := false
	a.Config.SMSVerificationEnabled = &off
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx"})
	var session struct{ UserID, Token string }
	json.Unmarshal(w.Body.Bytes(), &session)
	w = call(a, "POST", "/api/access/profile", session.Token, "", map[string]string{"name": "本人", "phone": "13900139000"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if accessOf(t, a, session.Token).Active {
		t.Fatal("unverified phone claimed branch")
	}
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "proof"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if access := accessOf(t, a, session.Token); !access.Active || access.PartnerID != branch.ID {
		t.Fatal(access)
	}
}

func TestBranchPhoneCreationRequiredUniqueAtomicAndIdempotent(t *testing.T) {
	a, _, _ := setup(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	for _, phone := range []string{"", "bad", "123"} {
		w := call(a, "POST", "/api/admin/partners", super, "invalid-phone", map[string]string{"name": "分公司", "role": "branch", "parentId": "root", "phone": phone})
		if w.Code != 400 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	first := phoneBranch(t, a, super, "13900139000", "unique-branch", true)
	again := phoneBranch(t, a, super, "13900139000", "unique-branch", true)
	if first.ID != again.ID {
		t.Fatal("idempotency lost")
	}
	for _, body := range []map[string]any{
		{"name": "重复手机", "phone": "13900139000"},
		{"name": "重复账号", "phone": "13900139001", "account": map[string]string{"username": "unique-branch", "password": "Tester12", "role": "branch"}},
	} {
		body["role"], body["parentId"] = "branch", "root"
		w := call(a, "POST", "/api/admin/partners", super, "conflict-"+body["name"].(string), body)
		if w.Code != 409 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	rows, _ := a.Store.List(t.Context(), "partners", "")
	if len(rows) != 1 {
		t.Fatal("partial branch created", len(rows))
	}
	changed := call(a, "POST", "/api/admin/partners", super, "branch-phone-unique-branch", map[string]string{"name": "changed", "phone": "13900139009", "role": "branch", "parentId": "root"})
	if changed.Code != 409 {
		t.Fatal("changed idempotent body accepted", changed.Code)
	}
}
