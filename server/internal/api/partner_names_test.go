package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestDuplicateBranchNameLeavesNoPartialIdentityAndCanRetry(t *testing.T) {
	a, _, _ := setup(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	body := func(name, phone, username string) map[string]any {
		return map[string]any{"name": name, "phone": phone, "parentId": "root", "role": "branch", "account": map[string]string{"username": username, "password": "Tester12", "role": "branch"}}
	}
	w := call(a, "POST", "/api/admin/partners", super, "named-branch-first", body("华东分公司", "13900139000", "named-first"))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var first core.Record
	json.Unmarshal(w.Body.Bytes(), &first)
	duplicate := body(" 华东分公司 ", "13900139001", "named-second")
	w = call(a, "POST", "/api/admin/partners", super, "named-branch-second", duplicate)
	if w.Code != 400 || !strings.Contains(w.Body.String(), "同名") {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, e := a.Store.Get(t.Context(), "admin_accounts", adminID("named-second")); e == nil {
		t.Fatal("partial account created")
	}
	if _, e := a.Store.Get(t.Context(), "branch_phones", "13900139001"); e == nil {
		t.Fatal("phone reserved by failed creation")
	}
	duplicate["name"] = "华南分公司"
	w = call(a, "POST", "/api/admin/partners", super, "named-branch-second", duplicate)
	if w.Code != 200 {
		t.Fatal("corrected name could not retry", w.Code, w.Body.String())
	}
	var second core.Record
	json.Unmarshal(w.Body.Bytes(), &second)
	var data core.Partner
	json.Unmarshal(second.Data, &data)
	data.Name = "华东分公司"
	w = call(a, "PUT", "/api/admin/partners/"+second.ID, super, "", map[string]any{"version": second.Version, "data": data})
	if w.Code != 400 || !strings.Contains(w.Body.String(), "同名") {
		t.Fatal("rename collision accepted", w.Code, w.Body.String())
	}
}
