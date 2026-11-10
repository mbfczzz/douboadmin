package api

import (
	"encoding/json"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestSubprovidersStillJoinByScanAndWaitForApproval(t *testing.T) {
	for _, c := range []struct{ parentRole, role string }{{"branch", "s1"}, {"branch", "s2"}, {"s1", "s2"}} {
		t.Run(c.parentRole+"-"+c.role, func(t *testing.T) {
			a, user, admin := activationFixture(t)
			parent := createBranch(t, a, admin, "scan-only")
			if c.parentRole == "s1" {
				parent = createProvider(t, a, admin, "scan-parent", parent, "已有S1", "s1", nil)
			}
			invite := providerCode(t, a, "GET", parent, c.role, admin)
			reviewer := reviewLogin(t, a, admin, parent)
			if status, body := joinHTTP(a, user, invite.Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
				t.Fatal("scan registration failed", status, body)
			}
			page := registrationPage(t, a, admin, "?status=pending")
			var reg core.Registration
			if page.Total != 1 || json.Unmarshal(page.Items[0].Data, &reg) != nil || reg.Role != c.role || reg.ParentID != parent || reg.Method != "scan" {
				t.Fatal("wrong scan registration", page)
			}
			_, data := providerData(t, a, admin, reg.PartnerID)
			if data["status"] != "pending" {
				t.Fatal("scan bypassed approval")
			}
			if status, body := decideHTTP(t, a, reviewer, "user-a", true, ""); status != 200 {
				t.Fatal("approval failed", status, body)
			}
			_, data = providerData(t, a, admin, reg.PartnerID)
			if data["status"] != "active" || data["parentId"] != parent || data["role"] != c.role {
				t.Fatal("approved provider has incorrect ownership", data)
			}
		})
	}
}

func TestBranchCreationWithLoginStillRetriesIdempotently(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	account := map[string]string{"username": "branch-only", "password": "branch-only-password-2026"}
	first := createProvider(t, a, admin, "branch-only", "root", "分公司", "branch", account)
	if again := createProvider(t, a, admin, "branch-only", "root", "分公司", "branch", account); again != first {
		t.Fatal("branch retry created another provider")
	}
	adminLoginToken(t, a, "branch-only", account["password"])
}
