package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func deletionPreview(t *testing.T, a *Server, token, id string) partners.DeletePreview {
	t.Helper()
	w := call(a, "GET", "/api/admin/partners/"+id+"/delete-preview", token, "", nil)
	var out partners.DeletePreview
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return out
}
func TestSuperDeleteEntireProviderTreePreservesFinancialHistory(t *testing.T) {
	a, _, super := activationFixture(t)
	root := createProvider(t, a, super, "delete-root", "root", "待删除分公司", "branch", map[string]string{"username": "delete-owner", "password": "Tester12"})
	child := createProvider(t, a, super, "delete-s1", root, "下级S1", "s1", map[string]string{"username": "delete-child", "password": "Tester12"})
	grandchild := createProvider(t, a, super, "delete-s2", child, "下级S2", "s2", nil)
	other := createBranch(t, a, super, "keep-branch")
	login := adminLoginToken(t, a, "delete-child", "Tester12")
	_, e := a.Store.Put(t.Context(), "memberships", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(core.Membership{PartnerID: grandchild, Status: "active"})}, 0)
	if e != nil {
		t.Fatal(e)
	}
	a.Store.Put(t.Context(), "partner_owners", core.Record{ID: "owner-user", Data: core.Data(core.PartnerOwner{PartnerID: child, Status: "active"})}, 0)
	a.Store.Put(t.Context(), "commission_accounts", core.Record{ID: child, Data: core.Data(map[string]any{"balanceFen": 4000})}, 0)
	ledger, _ := a.Store.Put(t.Context(), "commission_ledger", core.Record{ID: "historic", Owner: child, Data: core.Data(map[string]any{"amountFen": 1000, "partnerId": child})}, 0)
	code, e := a.Partners.Share(t.Context(), grandchild, partners.MemberCode, "admin")
	if e != nil {
		t.Fatal(e)
	}
	for _, method := range []string{"GET", "DELETE"} {
		path := "/api/admin/partners/" + root
		if method == "GET" {
			path += "/delete-preview"
		}
		if w := call(a, method, path, login, "", map[string]string{}); w.Code != 403 {
			t.Fatal("non-super deletion", w.Code)
		}
	}
	preview := deletionPreview(t, a, super, root)
	if preview.Providers != 3 || preview.Accounts != 2 || preview.Members != 1 {
		t.Fatal(preview)
	}
	w := call(a, "DELETE", "/api/admin/partners/"+root, super, "", map[string]string{"confirm": "delete-users", "token": preview.Token, "reason": "测试删除整棵结构"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, id := range []string{root, child, grandchild} {
		_, p, e := recordOf[core.Partner](t.Context(), a.Store, "partners", id)
		if e != nil || p.Status != "deleted" {
			t.Fatal("descendant not deleted", id, e)
		}
	}
	if w = call(a, "GET", "/api/admin/me", login, "", nil); w.Code != 403 {
		t.Fatal("deleted backend still authorized", w.Code)
	}
	tree := call(a, "GET", "/api/admin/partners/tree?page=1", super, "", nil)
	if tree.Code != 200 || strings.Contains(tree.Body.String(), root) || !strings.Contains(tree.Body.String(), other) {
		t.Fatal(tree.Body.String())
	}
	_, member, _ := recordOf[core.Membership](t.Context(), a.Store, "memberships", "user-a")
	if member.Status != "unbound" {
		t.Fatal(member)
	}
	_, share, _ := recordOf[core.ShareCode](t.Context(), a.Store, "share_codes", code.Code)
	if share.Status == "active" {
		t.Fatal("share code still active")
	}
	after, _ := a.Store.Get(t.Context(), "commission_ledger", ledger.ID)
	if string(after.Data) != string(ledger.Data) || after.Version != ledger.Version {
		t.Fatal("financial history changed")
	}
	if w = call(a, "GET", "/api/admin/partners/root/delete-preview", super, "", nil); w.Code != 400 {
		t.Fatal("root deletion allowed")
	}
}

func TestDeleteTreeRejectsStalePreviewAndIncludesOver500Children(t *testing.T) {
	a, _, super := activationFixture(t)
	root := createBranch(t, a, super, "large-delete")
	old := deletionPreview(t, a, super, root)
	err := a.Store.Atomic(t.Context(), func(tx store.Transaction) error {
		for i := 0; i < 505; i++ {
			id := fmt.Sprintf("child-%03d", i)
			_, e := tx.Put("partners", core.Record{ID: id, Owner: root, Data: core.Data(core.Partner{Name: id, ParentID: root, Path: []string{"root", root}, Role: "s1", Status: "active"})}, 0)
			if e != nil {
				return e
			}
			user := "member-" + id
			if _, e = tx.Put("users", core.Record{ID: user, Owner: user, Data: core.Data(map[string]string{"nickname": user})}, 0); e != nil {
				return e
			}
			if _, e = tx.Put("memberships", core.Record{ID: user, Owner: user, Data: core.Data(core.Membership{PartnerID: id, Status: "active"})}, 0); e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	w := call(a, "DELETE", "/api/admin/partners/"+root, super, "", map[string]string{"confirm": "delete-users", "token": old.Token, "reason": "结构已变更"})
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	preview := deletionPreview(t, a, super, root)
	if preview.Providers != 506 || preview.Users != 505 {
		t.Fatal(preview)
	}
	w = call(a, "DELETE", "/api/admin/partners/"+root, super, "", map[string]string{"confirm": "delete-users", "token": preview.Token, "reason": "确认全部删除"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	_, last, _ := recordOf[core.Partner](t.Context(), a.Store, "partners", "child-504")
	if last.Status != "deleted" {
		t.Fatal("500-row truncation")
	}
	_, lastUser, _ := recordOf[map[string]any](t.Context(), a.Store, "users", "member-child-504")
	if lastUser["archived"] != true {
		t.Fatal("users truncated at 500")
	}
}
