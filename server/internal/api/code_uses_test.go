package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"net/url"
	"testing"
)

func codeUsesPage(t *testing.T, a *Server, provider, kind, code, query, token string) core.RecordPage {
	t.Helper()
	w := call(a, "GET", "/api/admin/partners/"+provider+"/code-uses?kind="+kind+"&code="+url.QueryEscape(code)+query, token, "", nil)
	var page core.RecordPage
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil {
		t.Fatal("code uses page", w.Code, w.Body.String())
	}
	return page
}

func TestCodeUsesExposeEveryPendingScanAtItsIssuer(t *testing.T) {
	for _, kind := range []string{"member", "s1", "s2", "bind", "promo"} {
		t.Run(kind, func(t *testing.T) {
			a, user, admin := awaitingBrowser(t, kind)
			regRow, _ := a.Store.Get(t.Context(), "registrations", "user-a")
			var reg core.Registration
			_ = json.Unmarshal(regRow.Data, &reg)
			useRow, _ := a.Store.Get(t.Context(), "code_uses", core.CodeUseID("user-a", reg.Code))
			page := codeUsesPage(t, a, useRow.Owner, kind, reg.Code, "&status=pending", admin)
			var use core.CodeUse
			if page.Total != 1 || json.Unmarshal(page.Items[0].Data, &use) != nil || use.UserID != "user-a" || use.Status != "pending" || use.Name != reg.Name || use.Phone != reg.Phone {
				t.Fatal("pending usage invisible", page)
			}
			if w := call(a, "GET", "/api/admin/partners/"+useRow.Owner+"/code-uses?kind="+kind, user, "", nil); w.Code != 403 {
				t.Fatal("mini-program user read private scan records", w.Code)
			}
			approve(t, a, "user-a")
			if page = codeUsesPage(t, a, useRow.Owner, kind, reg.Code, "&status=approved", admin); page.Total != 1 {
				t.Fatal("approval not reflected")
			}
		})
	}
}

func TestCodeUsesSearchPaginationAndProviderScope(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := createProvider(t, a, admin, "uses-scope", "root", "分公司", "branch", map[string]string{"username": "uses-parent", "password": "Tt9ba6b3"})
	other := createBranch(t, a, admin, "uses-other")
	share := providerCode(t, a, "GET", branch, "member", admin)
	for i := 0; i < 22; i++ {
		id := fmt.Sprintf("scan-user-%02d", i)
		put := core.Record{ID: id, Data: core.Data(map[string]string{"name": "扫码姓名" + id, "nickname": "微信昵称", "phone": fmt.Sprintf("13900139%03d", i)})}
		if _, e := a.Store.Put(t.Context(), "users", put, 0); e != nil {
			t.Fatal(e)
		}
		if _, e := a.Partners.Join(t.Context(), id, share.Code, "scan"); e != nil {
			t.Fatal(e)
		}
	}
	provider := adminLoginToken(t, a, "uses-parent", "Tt9ba6b3")
	first := codeUsesPage(t, a, branch, "member", share.Code, "&page=1", admin)
	second := codeUsesPage(t, a, branch, "member", share.Code, "&page=2", admin)
	if first.Total != 22 || len(first.Items) != 20 || len(second.Items) != 2 {
		t.Fatal("incorrect usage pagination")
	}
	if page := codeUsesPage(t, a, branch, "member", share.Code, "&q="+url.QueryEscape("scan-user-04"), admin); page.Total != 1 {
		t.Fatal("user id search lost hyphens", page.Total)
	}
	if page := codeUsesPage(t, a, branch, "member", share.Code, "&q=13900139004", admin); page.Total != 1 {
		t.Fatal("phone search failed")
	}
	pretty := share.Code[:4] + "-" + share.Code[4:]
	if page := codeUsesPage(t, a, branch, "member", share.Code, "&q="+pretty, admin); page.Total != 22 {
		t.Fatal("formatted code search failed")
	}
	if page := codeUsesPage(t, a, branch, "s1", share.Code, "", admin); page.Total != 0 {
		t.Fatal("different code kinds were mixed")
	}
	if w := call(a, "GET", "/api/admin/partners/"+other+"/code-uses?kind=member", provider, "", nil); w.Code != 403 {
		t.Fatal("provider read another issuer's users", w.Code)
	}
	for _, query := range []string{"?kind=invalid", "?kind=s1&status=active", "?kind=s1&page=0"} {
		if w := call(a, "GET", "/api/admin/partners/"+branch+"/code-uses"+query+"&code="+share.Code, admin, "", nil); w.Code != 400 {
			t.Fatal("invalid filter accepted", query, w.Code)
		}
	}
}
