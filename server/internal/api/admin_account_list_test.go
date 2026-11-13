package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
	"testing"
)

func TestUnifiedAccountsIncludeProviderLoginsAndPreserveScope(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	const password = "Ttdefa97"
	partnerID := createProvider(t, a, admin, "list-provider", "root", "列表服务商", "branch", map[string]string{"username": "list-provider", "password": password})
	provider := adminLoginToken(t, a, "list-provider", password)
	accountID := adminID("list-provider")
	get := func(query string) (int, []core.Record) {
		t.Helper()
		response := call(a, "GET", "/api/admin/accounts"+query, admin, "", nil)
		var body struct {
			Items []core.Record `json:"items"`
			Total int           `json:"total"`
		}
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &body) != nil {
			t.Fatal(response.Code, response.Body.String())
		}
		if strings.Contains(response.Body.String(), "passwordHash") || strings.Contains(response.Body.String(), password) {
			t.Fatal("account list exposed login credentials")
		}
		return body.Total, body.Items
	}
	total, rows := get("")
	if total != 2 || len(rows) != 2 {
		t.Fatal("provider login missing from unified list", total, len(rows))
	}
	total, rows = get("?page=1&q=list-provider")
	if total != 1 || len(rows) != 1 || rows[0].ID != accountID {
		t.Fatal("provider login search failed", total)
	}
	var view struct {
		core.AdminAccount
		PartnerName string `json:"partnerName"`
		PartnerRole string `json:"partnerRole"`
	}
	if err := json.Unmarshal(rows[0].Data, &view); err != nil || view.PartnerID != partnerID || view.PartnerName != "列表服务商" || view.PartnerRole != "branch" || view.LastLoginAt.IsZero() {
		t.Fatal("missing provider association or login time", err)
	}
	stored, _ := a.Store.Get(t.Context(), "admin_accounts", accountID)
	if strings.Contains(string(stored.Data), "partnerName") || stored.Version != rows[0].Version {
		t.Fatal("view metadata modified the stored account")
	}
	if response := call(a, "GET", "/api/admin/accounts", provider, "", nil); response.Code != 403 {
		t.Fatal("provider gained platform account visibility", response.Code)
	}
	if response := call(a, "PUT", "/api/admin/accounts/"+accountID, admin, "", map[string]any{"version": rows[0].Version, "role": "super_admin"}); response.Code != 400 {
		t.Fatal("provider login bypassed its scoped mutation endpoint", response.Code)
	}
	// Disabling the login uses the existing provider endpoint and is reflected
	// in the unified list without changing provider ownership or role.
	response := call(a, "PUT", "/api/admin/partners/"+partnerID+"/account", admin, "", map[string]any{"version": rows[0].Version, "role": view.Role, "disabled": true})
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	_, rows = get("?q=list-provider")
	var disabled core.AdminAccount
	_ = json.Unmarshal(rows[0].Data, &disabled)
	if !disabled.Disabled || disabled.PartnerID != partnerID || disabled.Role != view.Role {
		t.Fatal("provider login status or scope drifted")
	}
	archived := disabled
	archived.Archived = true
	putPagingRecord(t, a, "admin_accounts", core.Record{ID: "archived-provider", Data: core.Data(archived)})
	putPagingRecord(t, a, "users", core.Record{ID: "mini-only", Data: core.Data(map[string]string{"name": "小程序用户"})})
	if total, _ := get(""); total != 2 {
		t.Fatal("archived login or mini-program user entered the account list", total)
	}
}
