package api

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func memberReviewPage(t *testing.T, a *Server, id, token, query string) core.RecordPage {
	t.Helper()
	w := call(a, "GET", "/api/admin/partners/"+id+"/member-registrations"+query, token, "", nil)
	var page core.RecordPage
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil {
		t.Fatal("member review inbox", w.Code, w.Body.String())
	}
	return page
}

func TestPendingMembersRemainReviewableAfterTheirCodeIsReset(t *testing.T) {
	a, user, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	branch := createBranch(t, a, admin, "member-inbox")
	parent := reviewLogin(t, a, admin, branch)
	other := createBranch(t, a, admin, "other-inbox")
	unrelated := reviewLogin(t, a, admin, other)
	old := providerCode(t, a, "GET", branch, "member", parent)
	for i := range 23 {
		id := fmt.Sprintf("pending-member-%02d", i)
		appUser(t, a, id, "待开通会员"+id, fmt.Sprintf("13900000%03d", i))
		scan(t, a, id, old.Code)
	}
	invite := providerCode(t, a, "GET", branch, "s1", parent)
	scan(t, a, "user-a", invite.Code)
	fresh := providerCode(t, a, "POST", branch, "member", parent)
	if page := codeUsesPage(t, a, branch, "member", fresh.Code, "", parent); page.Total != 0 {
		t.Fatal("current QR mixed in an old code's users")
	}
	first := memberReviewPage(t, a, branch, parent, "?status=pending&page=1&provider="+other)
	second := memberReviewPage(t, a, branch, parent, "?status=pending&page=2")
	if first.Total != 23 || len(first.Items) != 20 || len(second.Items) != 3 {
		t.Fatal("pending old-code members were lost or provider scans mixed in", first.Total, second.Total)
	}
	for _, row := range append(first.Items, second.Items...) {
		var view struct {
			core.Registration
			CanReview  bool `json:"canReview"`
			CanApprove bool `json:"canApprove"`
			CanReject  bool `json:"canReject"`
		}
		if json.Unmarshal(row.Data, &view) != nil || view.CanReview || view.CanApprove || !view.CanReject || view.Code != old.Code || view.PartnerID != branch || view.Role != "member" {
			t.Fatal("wrong member inbox data", string(row.Data))
		}
	}
	if page := memberReviewPage(t, a, branch, parent, "?q=pending-member-04"); page.Total != 1 {
		t.Fatal("member search failed", page.Total)
	}
	if status, body := decideHTTP(t, a, parent, "pending-member-04", true, ""); status != 403 {
		t.Fatal("provider opened old-code member", status, body)
	}
	if status, body := decideHTTP(t, a, admin, "pending-member-04", true, ""); status != 200 {
		t.Fatal("super administrator could not open old-code member", status, body)
	}
	if page := memberReviewPage(t, a, branch, parent, "?status=pending"); page.Total != 22 {
		t.Fatal("approved member stayed pending")
	}
	if page := memberReviewPage(t, a, branch, admin, "?status=approved"); page.Total != 1 || !strings.Contains(string(page.Items[0].Data), `"canApprove":true`) {
		t.Fatal("super administrator lost approval capability")
	}
	path := "/api/admin/partners/" + branch + "/member-registrations"
	for _, token := range []string{user, unrelated} {
		if w := call(a, "GET", path, token, "", nil); w.Code != 403 {
			t.Fatal("unrelated caller read member inbox", w.Code)
		}
	}
	for _, query := range []string{"?page=0", "?page=1000001", "?status=active", "?q=" + strings.Repeat("a", 101)} {
		if w := call(a, "GET", path+query, parent, "", nil); w.Code != 400 {
			t.Fatal("invalid inbox filter", query, w.Code)
		}
	}
}
