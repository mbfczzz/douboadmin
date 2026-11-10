package api

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestCodeUsesAndMembersStayWithTheDisplayedCode(t *testing.T) {
	for _, kind := range []string{"s1", "s2", "member", "bind"} {
		t.Run(kind, func(t *testing.T) {
			a, _, admin := awaitingBrowser(t, kind)
			regRow, _ := a.Store.Get(t.Context(), "registrations", "user-a")
			var reg core.Registration
			_ = json.Unmarshal(regRow.Data, &reg)
			useRow, _ := a.Store.Get(t.Context(), "code_uses", core.CodeUseID("user-a", reg.Code))
			issuer := useRow.Owner
			if kind == "bind" {
				bound := providerCode(t, a, "GET", issuer, kind, admin)
				if bound.Code != reg.Code {
					t.Fatal("bound view lost the scanned code", bound.Code)
				}
				if _, e := a.Partners.Unbind(t.Context(), issuer, "admin"); e != nil {
					t.Fatal(e)
				}
			} else {
				providerCode(t, a, "POST", issuer, kind, admin)
			}
			fresh := providerCode(t, a, "GET", issuer, kind, admin)
			if fresh.Code == reg.Code {
				t.Fatal("reset kept old code")
			}
			if page := codeUsesPage(t, a, issuer, kind, fresh.Code, "", admin); page.Total != 0 {
				t.Fatal("old code users leaked into new code", page.Total)
			}
			pretty := strings.ToLower(reg.Code[:4] + "-" + reg.Code[4:])
			if page := codeUsesPage(t, a, issuer, kind, pretty, "", admin); page.Total != 1 {
				t.Fatal("exact displayed code lost its history", page.Total)
			}
			if kind == "member" {
				for code, total := range map[string]int{reg.Code: 1, fresh.Code: 0} {
					w := call(a, "GET", "/api/admin/memberships?provider="+issuer+"&code="+code, admin, "", nil)
					var page core.RecordPage
					if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || page.Total != total {
						t.Fatal("member list mixed codes", w.Code, w.Body.String())
					}
				}
			}
			other := createBranch(t, a, admin, "other-code-owner")
			if page := codeUsesPage(t, a, other, kind, reg.Code, "", admin); page.Total != 0 {
				t.Fatal("another issuer's code users leaked")
			}
			for _, code := range []string{"", "invalid", strings.Repeat("A", 1000)} {
				path := "/api/admin/partners/" + issuer + "/code-uses?kind=" + kind + "&code=" + url.QueryEscape(code)
				if w := call(a, "GET", path, admin, "", nil); w.Code != 400 {
					t.Fatal("missing or invalid code accepted", w.Code)
				}
			}
		})
	}
}
