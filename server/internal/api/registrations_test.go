package api

import (
	"encoding/json"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func registrationPage(t *testing.T, a *Server, token, query string) core.RecordPage {
	t.Helper()
	var page core.RecordPage
	w := call(a, "GET", "/api/admin/registrations"+query, token, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return page
}

func TestRegistrationWaitsForDirectParentApproval(t *testing.T) {
	a, user, admin := activationFixture(t)
	branch := newBranch(t, a, "review")
	parent := reviewLogin(t, a, admin, branch)
	code, _ := a.Partners.ShareCode(t.Context(), branch, "admin")
	if status, body := joinHTTP(a, user, code); status != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(status, body)
	}
	if v := accessOf(t, a, user); v.Active || v.Status != "review" || v.PartnerID != branch || v.Message != "已登记，等待上级开通" {
		t.Fatal("pending access", v)
	}
	if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("pending user cannot browse templates", w.Code)
	}
	if w := call(a, "POST", "/api/jobs", user, "", map[string]any{}); w.Code != 403 || !strings.Contains(w.Body.String(), "ACTIVATION_REQUIRED") {
		t.Fatal("pending user could generate", w.Code)
	}
	if status, body := joinHTTP(a, user, code); status != 400 || !strings.Contains(body, "等待上级开通") {
		t.Fatal("registered twice while pending", status, body)
	}
	page := registrationPage(t, a, admin, "?status=pending&q=测试用户")
	var reg core.Registration
	if page.Total != 1 || page.Items[0].ID != "user-a" || json.Unmarshal(page.Items[0].Data, &reg) != nil {
		t.Fatal("pending list", page)
	}
	if reg.Role != "member" || reg.PartnerID != branch || reg.CodeKind != "" || reg.Code != code || reg.Method != "scan" || reg.Phone != "13800138000" {
		t.Fatal("registration", reg)
	}
	if w := call(a, "GET", "/api/admin/registrations?status=bogus", admin, "", nil); w.Code != 400 {
		t.Fatal("invalid status filter", w.Code)
	}
	stale := map[string]any{"approve": true, "version": page.Items[0].Version + 1}
	if w := call(a, "PUT", "/api/admin/registrations/user-a", parent, "", stale); w.Code != 409 {
		t.Fatal("stale decision accepted", w.Code, w.Body.String())
	}
	if status, body := decideHTTP(t, a, parent, "user-a", true, ""); status != 200 || !strings.Contains(body, `"status":"approved"`) {
		t.Fatal(status, body)
	}
	if w := call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("approved member blocked", w.Code, w.Body.String())
	}
	if status, body := decideHTTP(t, a, parent, "user-a", false, "重复处理"); status != 400 || !strings.Contains(body, "已处理") {
		t.Fatal("decided twice", status, body)
	}
	if p := registrationPage(t, a, admin, "?status=pending"); p.Total != 0 {
		t.Fatal("approved registration still pending", p)
	}
	if p := registrationPage(t, a, admin, "?status=approved"); p.Total != 1 {
		t.Fatal("approved list", p)
	}
}

func TestRejectedUserCanScanAgain(t *testing.T) {
	a, user, admin := activationFixture(t)
	branch := newBranch(t, a, "reject")
	parent := reviewLogin(t, a, admin, branch)
	member, _ := a.Partners.ShareCode(t.Context(), branch, "admin")
	if status, body := joinHTTP(a, user, member); status != 200 {
		t.Fatal(status, body)
	}
	if status, body := decideHTTP(t, a, parent, "user-a", false, ""); status != 400 {
		t.Fatal("rejected without a reason", status, body)
	}
	if status, body := decideHTTP(t, a, parent, "user-a", false, "资料不完整"); status != 200 || !strings.Contains(body, "资料不完整") {
		t.Fatal(status, body)
	}
	if v := accessOf(t, a, user); v.Active || v.Status != "rejected" {
		t.Fatal("rejected access", v)
	}
	// A rejected provider registration stays closed and frees its user too.
	invite, _ := a.Partners.Share(t.Context(), branch, "s1", "admin")
	if status, body := joinHTTP(a, user, invite.Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(status, body)
	}
	created, _ := a.Partners.OwnedPartner(t.Context(), "user-a")
	decide(t, a, "user-a", false, "暂不发展")
	row, e := a.Store.Get(t.Context(), "partners", created)
	if e != nil || !strings.Contains(string(row.Data), `"status":"rejected"`) {
		t.Fatal("rejected provider", string(row.Data), e)
	}
	if _, e := a.Partners.ResetShare(t.Context(), branch, "", "admin"); e != nil {
		t.Fatal(e)
	}
	member, _ = a.Partners.ShareCode(t.Context(), branch, "admin")
	if status, body := joinHTTP(a, user, member); status != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal("rejected user could not register again", status, body)
	}
	approve(t, a, "user-a")
	if v := accessOf(t, a, user); !v.Active || v.PartnerID != branch {
		t.Fatal("approved after rejection", v)
	}
}

func TestGlobalRegistrationsAndManualProviderCreationRemainPlatformOnly(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	branch := createProvider(t, a, admin, "only-branch", "root", "分公司", "branch", map[string]string{"username": "only-branch", "password": "only-branch-password-2026"})
	code, _ := a.Partners.ShareCode(t.Context(), branch, "admin")
	scan(t, a, "user-a", code)
	provider := adminLoginToken(t, a, "only-branch", "only-branch-password-2026")
	for _, c := range []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/admin/registrations", nil},
		{"GET", "/api/admin/registrations?status=pending", nil},
		{"POST", "/api/admin/partners", map[string]any{"parentId": branch, "name": "自建 S1", "role": "s1"}},
	} {
		for _, token := range []string{provider, user} {
			if w := call(a, c.method, c.path, token, "platform-only-key", c.body); w.Code != 403 {
				t.Fatal("non-platform caller allowed", c.method, c.path, w.Code, w.Body.String())
			}
		}
	}
	if v := accessOf(t, a, user); v.Active {
		t.Fatal("a denied operation opened a registration", v)
	}
}
