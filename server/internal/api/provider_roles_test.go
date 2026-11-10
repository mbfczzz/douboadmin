package api

import (
	"encoding/json"
	"errors"
	"maps"
	"slices"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

type roleCenter struct {
	Role     string
	Members  int
	Owner    bool
	Codes    map[string]shareView
	Children []childView
}

func centerOf(t *testing.T, a *Server, token string) (roleCenter, string) {
	t.Helper()
	var v roleCenter
	w := call(a, "GET", "/api/provider", token, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &v) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return v, w.Body.String()
}

func codeKinds(v roleCenter) []string {
	return slices.Sorted(maps.Keys(v.Codes))
}

// A 分公司 shows 会员, S1 and S2 codes; an S1 会员 and S2; an S2 only 会员.
// Each sees the providers right below it, never upward.
func TestProviderCenterFollowsRole(t *testing.T) {
	a, _, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	branch := createProvider(t, a, admin, "center-branch", "root", "江苏分公司", "branch", nil)
	chief, lead, boss := appUser(t, a, "chief", "老陈", "13900000021"), appUser(t, a, "lead", "小李", "13900000022"), appUser(t, a, "boss", "小王", "13900000023")
	fan := appUser(t, a, "fan", "小张", "13900000024")
	appUser(t, a, "waiting", "小赵", "13900000025")
	bindOwner(t, a, branch, "chief")
	view, _ := centerOf(t, a, chief)
	if view.Role != "branch" || view.Owner || !slices.Equal(codeKinds(view), []string{"member", "s1", "s2"}) || len(view.Children) != 0 {
		t.Fatal("分公司 center", view)
	}
	// The 分公司's own S1 code, scanned in the mini-program, makes an S1.
	if status, body := joinHTTP(a, lead, view.Codes["s1"].Code); status != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(status, body)
	}
	approve(t, a, "lead")
	s1, _ := a.Partners.OwnedPartner(t.Context(), "lead")
	s1View, _ := centerOf(t, a, lead)
	if s1View.Role != "s1" || !s1View.Owner || !slices.Equal(codeKinds(s1View), []string{"member", "s2"}) {
		t.Fatal("S1 center", s1View)
	}
	joinHTTP(a, boss, s1View.Codes["s2"].Code)
	approve(t, a, "boss")
	joinHTTP(a, fan, s1View.Codes["member"].Code)
	approve(t, a, "fan")
	scan(t, a, "waiting", s1View.Codes["member"].Code)
	// Only opened 会员 count.
	s1View, _ = centerOf(t, a, lead)
	if s1View.Members != 1 || len(s1View.Children) != 1 || s1View.Children[0].Name != "小王" || s1View.Children[0].Role != "s2" || !s1View.Children[0].Scanned {
		t.Fatal("S1 members and children", s1View)
	}
	view, _ = centerOf(t, a, chief)
	if len(view.Children) != 1 || view.Children[0].ID != s1 || view.Children[0].Members != 1 || view.Children[0].Status != "active" {
		t.Fatal("分公司 children", view.Children)
	}
	s2View, body := centerOf(t, a, boss)
	if s2View.Role != "s2" || !slices.Equal(codeKinds(s2View), []string{"member"}) || strings.Contains(body, `"children"`) || strings.Contains(body, "小李") || strings.Contains(body, "江苏分公司") {
		t.Fatal("S2 saw upward or got invites", body)
	}
	if w := call(a, "GET", "/api/provider", fan, "", nil); w.Code != 403 {
		t.Fatal("a member opened the provider center", w.Code)
	}
}

// An approved scanned provider works under its own provider: it creates
// jobs and recharges without a commission on itself.
func TestApprovedOwnerCreatesJobsAndRechargesWithoutCommission(t *testing.T) {
	a, user, _ := activationFixture(t)
	ctx := t.Context()
	invite, _ := a.Partners.Share(ctx, newBranch(t, a, "owner"), "s1", "admin")
	scan(t, a, "user-a", invite.Code)
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "test", Resolution: "1K", Ratio: "1:1", Assets: []string{}}
	if w := call(a, "POST", "/api/jobs", user, "owner-job-pending", in); w.Code != 403 {
		t.Fatal("a pending owner created a job", w.Code, w.Body.String())
	}
	pending := core.NewJob("user-a", "owner-store-pending", in)
	pending.ActivationRequired = true
	if _, e := a.Store.CreateJob(ctx, pending); !errors.Is(e, core.ErrActivationRequired) {
		t.Fatal("store admitted a pending owner", e)
	}
	approve(t, a, "user-a")
	if w := call(a, "POST", "/api/jobs", user, "owner-job", in); w.Code != 202 {
		t.Fatal("an approved owner could not create a job", w.Code, w.Body.String())
	}
	policy := core.DefaultDistributionPolicy()
	policy.Enabled = true
	if _, e := a.Partners.SavePolicy(ctx, policy, 0, "admin"); e != nil {
		t.Fatal(e)
	}
	snapshot, units, e := a.Partners.UserQuote(ctx, "user-a", 10000, 100)
	if e != nil || snapshot != nil || units != 1000000 {
		t.Fatal("owner quote", snapshot, units, e)
	}
	order, e := a.Billing.CreateOrder(ctx, "user-a", "owner-order", 10000, core.DefaultPlatform(), "app", "merchant", "openid")
	if e != nil {
		t.Fatal(e)
	}
	var o core.Order
	if json.Unmarshal(order.Data, &o) != nil || o.Distribution != nil || o.PointsUnits != 1000000 {
		t.Fatal("owner order", string(order.Data))
	}
}
