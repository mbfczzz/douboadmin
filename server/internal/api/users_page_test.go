package api

import (
	"encoding/json"
	"fmt"
	"testing"

	"doubo/server/internal/core"
)

func TestAdminUsersArePagedAndFilteredByTheServer(t *testing.T) {
	a, _, _ := setup(t)
	before, _ := a.Store.UserPage(t.Context(), core.UserQuery{Page: 1, Size: 1})
	for i := range 25 {
		profile := map[string]any{"nickname": fmt.Sprintf("分页用户%02d", i), "phone": "1390000" + fmt.Sprintf("%04d", i)}
		if i == 3 {
			profile["disabled"] = true
		}
		if _, e := a.Store.Put(t.Context(), "users", core.Record{ID: fmt.Sprintf("page-user-%02d", i), Data: core.Data(profile)}, 0); e != nil {
			t.Fatal(e)
		}
		if i == 3 {
			wallet := core.Wallet{UserID: "page-user-03", Available: 12345}
			if _, e := a.Store.Put(t.Context(), "wallets", core.Record{ID: wallet.UserID, Owner: wallet.UserID, Data: core.Data(wallet)}, 0); e != nil {
				t.Fatal(e)
			}
		}
	}
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	var page struct {
		Items []core.Record `json:"items"`
		Total int           `json:"total"`
		Page  int           `json:"page"`
	}
	w := call(a, "GET", "/api/admin/users?page=2", admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != before.Total+25 || page.Page != 2 || len(page.Items) != min(20, page.Total-20) {
		t.Fatal(w.Code, w.Body.String())
	}
	var profile struct {
		Access         *core.Access `json:"access"`
		AvailableUnits int64        `json:"availableUnits"`
	}
	if json.Unmarshal(page.Items[0].Data, &profile) != nil || profile.Access == nil {
		t.Fatal("rows lost their access", string(page.Items[0].Data))
	}
	w = call(a, "GET", "/api/admin/users?q=分页用户0&state=disabled", admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != 1 || page.Items[0].ID != "page-user-03" {
		t.Fatal("filtered", w.Code, w.Body.String())
	}
	if json.Unmarshal(page.Items[0].Data, &profile) != nil || profile.AvailableUnits != 12345 {
		t.Fatal("wallet balance missing", string(page.Items[0].Data))
	}
	if w = call(a, "GET", "/api/admin/users?access=vip", admin, "", nil); w.Code != 400 {
		t.Fatal("unknown filter accepted", w.Code)
	}
}
