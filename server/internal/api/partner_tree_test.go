package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestPartnerTreeReturnsAllHierarchyLevels(t *testing.T) {
	a, _, _ := setup(t)
	login := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "test-pass"})
	admin := login.Result().Cookies()[0].Value
	parent := call(a, "POST", "/api/admin/partners", admin, "tree-parent", map[string]any{"parentId": "root", "name": "一级服务商", "users": 10})
	if parent.Code != 200 {
		t.Fatal(parent.Code, parent.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(parent.Body.Bytes(), &created) != nil {
		t.Fatal(parent.Body.String())
	}
	child := call(a, "POST", "/api/admin/partners", admin, "tree-child", map[string]any{"parentId": created.ID, "name": "二级服务商", "users": 4})
	if child.Code != 200 {
		t.Fatal(child.Code, child.Body.String())
	}
	tree := call(a, "GET", "/api/admin/partners/tree", admin, "", nil)
	var items []struct {
		Record core.Record       `json:"record"`
		Quota  core.PartnerQuota `json:"quota"`
	}
	if tree.Code != 200 || json.Unmarshal(tree.Body.Bytes(), &items) != nil || len(items) != 2 {
		t.Fatal(tree.Code, tree.Body.String())
	}
	for _, item := range items {
		if item.Record.ID == created.ID && (item.Quota.Users.Granted != 10 || item.Quota.Users.Allocated != 4 || item.Quota.Users.Available() != 6) {
			t.Fatal(item.Quota)
		}
	}
}
