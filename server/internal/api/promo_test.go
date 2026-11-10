package api

import (
	"encoding/json"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestPromoCodeRecordsTheReferrer(t *testing.T) {
	a, _, _ := activationFixture(t)
	ctx := t.Context()
	branch := newBranch(t, a, "promo")
	s1, e := a.Partners.Create(ctx, branch, "华东", core.RoleS1, "promo-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	fan, friend, late := appUser(t, a, "fan", "小张", "13900000031"), appUser(t, a, "friend", "小刘", "13900000032"), appUser(t, a, "late", "小孙", "13900000033")
	member, _ := a.Partners.ShareCode(ctx, s1.ID, "admin")
	scan(t, a, "fan", member)
	if w := call(a, "GET", "/api/promo", fan, "", nil); w.Code != 403 {
		t.Fatal("a pending member got a promo code", w.Code)
	}
	approve(t, a, "fan")
	var promo shareView
	if w := call(a, "GET", "/api/promo", fan, "", nil); w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &promo) != nil || promo.Code == "" || !strings.HasPrefix(promo.QR, "data:image/png;base64,") {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/promo", fan, "", nil); !strings.Contains(w.Body.String(), promo.Code) {
		t.Fatal("promo code changed between reads", w.Body.String())
	}
	if code, body := joinHTTP(a, friend, promo.Code); code != 200 || !strings.Contains(body, `"status":"review"`) || !strings.Contains(body, s1.ID) {
		t.Fatal(code, body)
	}
	row, _ := a.Store.Get(ctx, "registrations", "friend")
	var reg core.Registration
	if json.Unmarshal(row.Data, &reg) != nil || reg.Referrer != "fan" || reg.PartnerID != s1.ID || reg.CodeKind != "promo" || reg.Role != "member" {
		t.Fatal("promo registration", string(row.Data))
	}
	approve(t, a, "friend")
	src, e := a.Partners.Source(ctx, "friend")
	if e != nil || src.Kind != "member" || src.Membership.Referrer != "fan" || src.Referrer == nil || src.Referrer.Name != "小张" || len(src.Chain) != 2 || src.Chain[1].ID != s1.ID {
		t.Fatal("promo source", src, e)
	}
	// A suspended referrer's code stops working.
	m, _ := a.Store.Get(ctx, "memberships", "fan")
	if _, e = a.Partners.ChangeMembership(ctx, "fan", "disabled", "暂停推广", "admin", m.Version); e != nil {
		t.Fatal(e)
	}
	if code, body := joinHTTP(a, late, promo.Code); code != 400 || !strings.Contains(body, "推广码已失效") {
		t.Fatal("an inactive referrer's code registered", code, body)
	}
}

func TestPromoCodeIsForMembersOnly(t *testing.T) {
	a, _, _ := activationFixture(t)
	branch := newBranch(t, a, "promo-owner")
	boss := appUser(t, a, "boss", "老王", "13900000034")
	bindOwner(t, a, branch, "boss")
	if w := call(a, "GET", "/api/promo", boss, "", nil); w.Code != 400 || !strings.Contains(w.Body.String(), "开通会员") {
		t.Fatal("a provider owner got a promo code", w.Code, w.Body.String())
	}
}
