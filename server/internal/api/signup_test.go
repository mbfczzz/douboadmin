package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestOpenSignupCreatesSourceLessVisitorUntilApproval(t *testing.T) {
	a, user, admin := activationFixture(t)
	var setting core.Record
	w := call(a, "GET", "/api/admin/signup", admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &setting) != nil || strings.Contains(string(setting.Data), `"openSignup":true`) {
		t.Fatal("open signup must default closed", w.Code, w.Body.String())
	}
	if access := accessOf(t, a, user); access.OpenSignup || access.Active || access.CanBrowse {
		t.Fatal("default signup exposed access", access)
	}
	if w = call(a, "PUT", "/api/admin/signup", user, "", map[string]any{"version": 0, "openSignup": true}); w.Code != 403 {
		t.Fatal("user changed signup policy", w.Code, w.Body.String())
	}
	if w = call(a, "POST", "/api/access/direct", user, "", map[string]any{}); w.Code != 403 {
		t.Fatal("closed signup admitted a direct user", w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "direct_access", "user-a"); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("closed signup wrote a direct grant", err)
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 403 {
		t.Fatal("closed signup allowed business access", w.Code, w.Body.String())
	}
	w = call(a, "PUT", "/api/admin/signup", admin, "", map[string]any{"version": 0, "openSignup": true})
	if w.Code != 200 {
		t.Fatal("super admin could not open signup", w.Code, w.Body.String())
	}
	if v := accessOf(t, a, user); !v.OpenSignup || v.Active {
		t.Fatal("signup setting not exposed", v)
	}
	w = call(a, "POST", "/api/access/direct", user, "", map[string]any{})
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"review"`) || !strings.Contains(w.Body.String(), `"canBrowse":true`) {
		t.Fatal("ordinary signup did not create a visitor", w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "direct_access", "user-a"); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("new ordinary signup used legacy direct access", err)
	}
	if _, err := a.Store.Get(t.Context(), "memberships", "user-a"); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("ordinary visitor gained membership before approval", err)
	}
	registration, _ := a.Store.Get(t.Context(), "registrations", "user-a")
	var reg core.Registration
	if json.Unmarshal(registration.Data, &reg) != nil || reg.Role != core.RoleVisitor || reg.CodeKind != "direct" || reg.Code != "" || reg.PartnerID != core.RootPartner {
		t.Fatal("ordinary visitor registration invalid", reg)
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("visitor could not browse templates", w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/featured-works", user, "", nil); w.Code != 200 {
		t.Fatal("visitor could not view featured works", w.Code, w.Body.String())
	}
	page, err := a.Store.UserPage(t.Context(), core.UserQuery{Access: "review", Page: 1, Size: 20})
	if err != nil || page.Total != 1 || page.Items[0].ID != "user-a" {
		t.Fatal("ordinary visitor missing from review", page, err)
	}
	approve(t, a, "user-a")
	if access := accessOf(t, a, user); !access.Active || access.Status != "active" || access.PartnerID != core.RootPartner {
		t.Fatal("approval did not open root partner", access)
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("approved partner blocked from business", w.Code, w.Body.String())
	}
	job := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "direct signup", Resolution: "1K", Ratio: "1:1", Assets: []string{}}
	if w = call(a, "POST", "/api/jobs", user, "direct-signup-job", job); w.Code != 202 {
		t.Fatal("approved partner blocked by the storage billing guard", w.Code, w.Body.String())
	}
	source, err := a.Partners.Source(t.Context(), "user-a")
	if err != nil || source.Kind != "member" || source.Membership == nil || source.Membership.PartnerID != core.RootPartner || source.Referrer != nil || source.Registration == nil || source.Registration.Role != core.RoleVisitor || source.Registration.CodeKind != "direct" {
		t.Fatal("approved source-less partner invalid", source, err)
	}
	page, err = a.Store.UserPage(t.Context(), core.UserQuery{Access: "member", Page: 1, Size: 20})
	if err != nil || page.Total != 1 || page.Items[0].ID != "user-a" {
		t.Fatal("approved ordinary partner filter failed", page, err)
	}
	if w = call(a, "GET", "/api/promo", user, "", nil); w.Code != 200 {
		t.Fatal("approved ordinary partner has no promo code", w.Code, w.Body.String())
	} else {
		var promo shareView
		if json.Unmarshal(w.Body.Bytes(), &promo) != nil || promo.Code == "" {
			t.Fatal("invalid ordinary partner promo", w.Body.String())
		}
		referred := newMiniUser(t, a, "root-referred")
		row, _ := a.Store.Get(t.Context(), "users", "root-referred")
		row.Data = core.Data(registeredProfile("root-referred"))
		if _, err = a.Store.Put(t.Context(), "users", row, row.Version); err != nil {
			t.Fatal(err)
		}
		if code, body := joinHTTP(a, referred, promo.Code); code != 200 || !strings.Contains(body, `"status":"review"`) {
			t.Fatal(code, body)
		}
		if _, e := a.Store.Get(t.Context(), "memberships", "root-referred"); !errors.Is(e, core.ErrNotFound) {
			t.Fatal("promo visitor gained membership before approval", e)
		}
		visitorRow, _ := a.Store.Get(t.Context(), "registrations", "root-referred")
		var visitor core.Registration
		if json.Unmarshal(visitorRow.Data, &visitor) != nil || visitor.Role != core.RoleVisitor || visitor.PartnerID != core.RootPartner || visitor.Referrer != "user-a" {
			t.Fatal("promo visitor lost root source or referrer", visitor)
		}
	}
}

func TestPendingInviteCannotBeBypassedByOpenSignup(t *testing.T) {
	a, _, admin := activationFixture(t)
	if w := call(a, "PUT", "/api/admin/signup", admin, "", map[string]any{"version": 0, "openSignup": true}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	user := newMiniUser(t, a, "invite-first")
	row, _ := a.Store.Get(t.Context(), "users", "invite-first")
	row.Data = core.Data(registeredProfile("invite-first"))
	if _, err := a.Store.Put(t.Context(), "users", row, row.Version); err != nil {
		t.Fatal(err)
	}
	branch := newBranch(t, a, "invite-first")
	share := providerCode(t, a, "GET", branch, "member", admin)
	if code, body := joinHTTP(a, user, share.Code); code != 200 || !strings.Contains(body, `"status":"review"`) {
		t.Fatal(code, body)
	}
	w := call(a, "POST", "/api/access/direct", user, "", map[string]any{})
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"review"`) {
		t.Fatal("pending invite status was not preserved", w.Code, w.Body.String())
	}
	membership, _ := a.Store.Get(t.Context(), "memberships", "invite-first")
	var member core.Membership
	if json.Unmarshal(membership.Data, &member) != nil || member.PartnerID != branch {
		t.Fatal("ordinary signup overwrote the scanned source", member)
	}
}
