package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"slices"
	"testing"
)

func putPagingRecord(t *testing.T, a *Server, ns string, row core.Record) {
	t.Helper()
	if _, e := a.Store.Put(t.Context(), ns, row, 0); e != nil {
		t.Fatal(e)
	}
}

func TestProviderPagesAndScopeReachPastLegacyLimit(t *testing.T) {
	a, _, _ := setup(t)
	token := adminLoginToken(t, a, "admin", "test-pass")
	for i := 0; i < 521; i++ {
		id := fmt.Sprintf("provider-%04d", i)
		name := id
		if i == 0 {
			name = "最早分公司"
		}
		putPagingRecord(t, a, "partners", core.Record{ID: id, Owner: core.RootPartner, Data: core.Data(core.Partner{Name: name, ParentID: core.RootPartner, Path: []string{core.RootPartner}, Role: "branch", Status: "active"})})
	}
	putPagingRecord(t, a, "partners", core.Record{ID: "old-child", Owner: "provider-0000", Data: core.Data(core.Partner{Name: "old child", ParentID: "provider-0000", Path: []string{core.RootPartner, "provider-0000"}, Role: "s1", Status: "active"})})
	scope, e := a.Partners.Subtree(t.Context(), "provider-0000")
	if e != nil || !slices.Contains(scope, "provider-0000") || !slices.Contains(scope, "old-child") {
		t.Fatal(scope, e)
	}
	tree, e := a.Partners.Tree(t.Context())
	if e != nil || len(tree) != 522 {
		t.Fatal(len(tree), e)
	}
	for _, p := range []int{1, 27} {
		w := call(a, "GET", fmt.Sprintf("/api/admin/partners/tree?page=%d", p), token, "", nil)
		var out struct {
			Items []providerTreeItem `json:"items"`
			Total int                `json:"total"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil || out.Total != 521 || len(out.Items) != map[int]int{1: 20, 27: 1}[p] {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	w := call(a, "GET", "/api/admin/partners/tree?page=1&q=最早分公司", token, "", nil)
	var search struct {
		Items []providerTreeItem `json:"items"`
	}
	if json.Unmarshal(w.Body.Bytes(), &search) != nil || len(search.Items) != 1 || search.Items[0].Children != 1 {
		t.Fatal(w.Body.String())
	}
	w = call(a, "GET", "/api/admin/partners/tree?page=1&parent=provider-0000", token, "", nil)
	if json.Unmarshal(w.Body.Bytes(), &search) != nil || len(search.Items) != 1 || search.Items[0].ID != "old-child" {
		t.Fatal(w.Body.String())
	}
}

func TestAccountPagesAndRoleCountsIgnoreProviderVolume(t *testing.T) {
	a, _, _ := setup(t)
	token := adminLoginToken(t, a, "admin", "test-pass")
	for i := 0; i < 523; i++ {
		id := fmt.Sprintf("account-%04d", i)
		partner := "provider"
		if i < 22 {
			partner = ""
		}
		putPagingRecord(t, a, "admin_accounts", core.Record{ID: id, Data: core.Data(core.AdminAccount{Username: id, Name: id, Role: "operator", PartnerID: partner})})
	}
	w := call(a, "GET", "/api/admin/accounts?page=2", token, "", nil)
	var accounts struct {
		Items []core.Record `json:"items"`
		Total int           `json:"total"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &accounts) != nil || accounts.Total != 23 || len(accounts.Items) != 3 {
		t.Fatal(w.Code, w.Body.String())
	}
	_, _, found, e := a.providerAccount(t.Context(), "provider")
	if e != nil || !found {
		t.Fatal(found, e)
	}
	w = call(a, "GET", "/api/admin/roles?page=1", token, "", nil)
	var roles struct {
		Items []roleView `json:"items"`
	}
	if json.Unmarshal(w.Body.Bytes(), &roles) != nil {
		t.Fatal(w.Body.String())
	}
	for _, role := range roles.Items {
		if role.ID == "operator" && role.Accounts != 523 {
			t.Fatal(role.Accounts)
		}
	}
}

func TestRolePagesMergeBuiltinPrefixWithoutGaps(t *testing.T) {
	a, _, _ := setup(t)
	token := adminLoginToken(t, a, "admin", "test-pass")
	for i := 0; i < 42; i++ {
		id := fmt.Sprintf("role-%04d", i)
		putPagingRecord(t, a, "admin_roles", core.Record{ID: id, Data: core.Data(core.AdminRole{Name: id, Scope: "platform", Menus: []string{"overview"}})})
	}
	ids := map[string]bool{}
	for p := 1; p <= 3; p++ {
		w := call(a, "GET", fmt.Sprintf("/api/admin/roles?page=%d", p), token, "", nil)
		var out struct {
			Items []roleView `json:"items"`
			Total int        `json:"total"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil || out.Total != 42+len(core.BuiltinAdminRoleIDs()) {
			t.Fatal(w.Code, w.Body.String())
		}
		for _, row := range out.Items {
			if ids[row.ID] {
				t.Fatal("duplicate role across pages", row.ID)
			}
			ids[row.ID] = true
		}
	}
	if len(ids) != 42+len(core.BuiltinAdminRoleIDs()) {
		t.Fatal("missing role", len(ids))
	}
}
