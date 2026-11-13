package api

import (
	"encoding/json"
	"testing"

	"doubo/server/internal/core"
)

func reviewLogin(t *testing.T, a *Server, admin, partner string) string {
	t.Helper()
	username := "review-" + partner[:12]
	w := call(a, "PUT", "/api/admin/partners/"+partner+"/account", admin, "", map[string]any{
		"version": 0, "username": username, "password": "Ttd79fb7", "role": "partner",
	})
	if w.Code != 201 {
		t.Fatal("create review login", w.Code, w.Body.String())
	}
	return adminLoginToken(t, a, username, "Ttd79fb7")
}

func TestRegistrationApprovalIsOnlyForSuperAdmin(t *testing.T) {
	cases := []struct{ kind, target, parent string }{
		{"member", "branch", "branch"}, {"member", "s1", "s1"}, {"member", "s2", "s2"},
		{"s1", "branch", "branch"}, {"s2", "branch", "branch"}, {"s2", "s1", "s1"},
		{"bind", "branch", "root"}, {"bind", "s1", "branch"}, {"bind", "s2", "s1"},
		{"promo", "s2", "s2"},
	}
	for _, tc := range cases {
		for _, approve := range []bool{true, false} {
			name := tc.kind + "-" + tc.target + map[bool]string{true: "-approve", false: "-reject"}[approve]
			t.Run(name, func(t *testing.T) {
				a, user, _ := activationFixture(t)
				admin := adminLoginToken(t, a, "admin", "Tt661ea2")
				branch := createBranch(t, a, admin, "review-matrix")
				s1 := createProvider(t, a, admin, "review-s1", branch, "S1", "s1", nil)
				s2 := createProvider(t, a, admin, "review-s2", s1, "S2", "s2", nil)
				other := createBranch(t, a, admin, "review-other")
				ids := map[string]string{"root": "root", "branch": branch, "s1": s1, "s2": s2, "other": other}
				tokens := map[string]string{"root": admin}
				for _, level := range []string{"branch", "s1", "s2", "other"} {
					tokens[level] = reviewLogin(t, a, admin, ids[level])
				}
				var code string
				if tc.kind == "promo" {
					appUser(t, a, "promoter", "推荐人", "13900000008")
					joinPartner(t, a, s2, "promoter")
					code, _ = a.Partners.PromoCode(t.Context(), "promoter")
				} else {
					code = providerCode(t, a, "GET", ids[tc.target], tc.kind, admin).Code
				}
				if status, body := joinHTTP(a, user, code); status != 200 {
					t.Fatal("scan", status, body)
				}
				path := "/api/admin/registrations/user-a"
				listed := registrationPage(t, a, admin, "?status=pending")
				var view struct {
					CanReview bool `json:"canReview"`
				}
				if listed.Total != 1 || json.Unmarshal(listed.Items[0].Data, &view) != nil || !view.CanReview {
					t.Fatal("super administrator cannot review registration", listed)
				}
				before, _ := a.Store.Get(t.Context(), "registrations", "user-a")
				for level, token := range tokens {
					readStatus := 403
					if level == "root" {
						readStatus = 200
					}
					if w := call(a, "GET", path, token, "", nil); w.Code != readStatus {
						t.Fatal("incorrect inspection scope", level, w.Code, w.Body.String())
					}
					if level == "root" {
						continue
					}
					if status, body := decideHTTP(t, a, token, "user-a", approve, "资料不符"); status != 403 {
						t.Fatal("unauthorized decision accepted", level, status, body)
					}
				}
				after, _ := a.Store.Get(t.Context(), "registrations", "user-a")
				if after.Version != before.Version || string(after.Data) != string(before.Data) {
					t.Fatal("unauthorized review changed registration")
				}
				parent := admin
				if w := call(a, "GET", path, parent, "", nil); w.Code != 200 {
					t.Fatal("parent cannot read selected registration", w.Code, w.Body.String())
				}
				if w := call(a, "PUT", path, parent, "", map[string]any{"approve": approve, "reason": "资料不符", "version": before.Version + 1}); w.Code != 409 {
					t.Fatal("stale parent decision accepted", w.Code)
				}
				if status, body := decideHTTP(t, a, parent, "user-a", approve, "资料不符"); status != 200 {
					t.Fatal("direct parent cannot decide", status, body)
				}
				access := accessOf(t, a, user)
				if access.Active != approve || (!approve && access.Status != "rejected") {
					t.Fatal("decision did not change actual access", access)
				}
				usage, _ := a.Store.Get(t.Context(), "code_uses", core.CodeUseID("user-a", code))
				var log core.CodeUse
				_ = json.Unmarshal(usage.Data, &log)
				if log.Status != map[bool]string{true: "approved", false: "rejected"}[approve] {
					t.Fatal("usage status was not updated", log.Status)
				}
			})
		}
	}
}
