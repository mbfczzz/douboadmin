package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestPartnerTreeListsEveryRole(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createBranch(t, a, admin, "tree")
	s1 := createProvider(t, a, admin, "tree-s1", branch, "S1", "s1", nil)
	s2 := createProvider(t, a, admin, "tree-s2", s1, "S2", "s2", nil)
	direct := createProvider(t, a, admin, "tree-direct-s2", branch, "直属 S2", "s2", nil)
	tree := call(a, "GET", "/api/admin/partners/tree", admin, "", nil)
	var rows []core.Record
	if tree.Code != 200 || json.Unmarshal(tree.Body.Bytes(), &rows) != nil || len(rows) != 4 {
		t.Fatal(tree.Code, tree.Body.String())
	}
	want := map[string][2]string{branch: {"branch", "root"}, s1: {"s1", branch}, s2: {"s2", s1}, direct: {"s2", branch}}
	for _, row := range rows {
		var p core.Partner
		if json.Unmarshal(row.Data, &p) != nil || want[row.ID] != [2]string{p.Role, p.ParentID} || p.Status != "active" {
			t.Fatal("tree row", row.ID, string(row.Data))
		}
	}
}

func TestPlatformCannotManuallyCreateSubproviders(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createBranch(t, a, admin, "grow")
	s1 := createProvider(t, a, admin, "grow-s1", branch, "S1", "s1", nil)
	s2 := createProvider(t, a, admin, "grow-s2", s1, "S2", "s2", nil)
	// Every lower tier is scan-only, including otherwise valid parent/role pairs.
	for _, c := range []struct{ parent, role string }{
		{core.RootPartner, "s1"}, {core.RootPartner, "s2"}, {core.RootPartner, ""},
		{branch, "s1"}, {branch, "s2"}, {s1, "s2"},
		{branch, "branch"}, {s1, "s1"}, {s1, "branch"}, {s2, "s2"}, {s2, "s1"},
	} {
		w := call(a, "POST", "/api/admin/partners", admin, "grow-"+c.parent+"-"+c.role, map[string]any{"parentId": c.parent, "name": "越级", "role": c.role})
		if w.Code != 400 || !strings.Contains(w.Body.String(), "只能通过扫码") {
			t.Fatal("growth rule", c, w.Code, w.Body.String())
		}
	}
	rows, err := a.Partners.Tree(t.Context())
	if err != nil || len(rows) != 3 {
		t.Fatal("a rejected creation changed the tree", len(rows), err)
	}
}
