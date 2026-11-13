package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestBranchPhoneSMSLoginUsesSameOwnership(t *testing.T) {
	a, _, _ := setup(t)
	a.Config.RequireActivation = true
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := phoneBranch(t, a, super, "13900139000", "sms-branch", true)
	body := loginChallenge(t, a, "13900139000", "app")
	w := call(a, "POST", "/api/auth/phone/login", "", "", body)
	var session struct{ Token string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if access := accessOf(t, a, session.Token); !access.Active || access.PartnerID != branch.ID {
		t.Fatal(access)
	}
}

func TestDisabledBranchCannotBeClaimedByPhone(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	row := phoneBranch(t, a, super, "13900139000", "disabled-branch", true)
	var p core.Partner
	json.Unmarshal(row.Data, &p)
	p.Status = "disabled"
	if _, e := a.Partners.Update(t.Context(), row.ID, p, row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "proof"})
	if w.Code != 403 {
		t.Fatal(w.Code, w.Body.String())
	}
	mapping, binding, e := recordOf[branchPhone](t.Context(), a.Store, "branch_phones", "13900139000")
	if e != nil || binding.UserID != "" || mapping.Version != 2 {
		t.Fatal("disabled branch partially claimed", e)
	}
}
