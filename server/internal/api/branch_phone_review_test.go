package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/settings"
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestBranchPhoneChangeMovesReservationAndPreservesTree(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := phoneBranch(t, a, super, "13900139000", "move-phone", true)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "proof"})
	var session struct{ Token, UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &session) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	profile, _ := a.Store.Get(t.Context(), "users", session.UserID)
	body := map[string]any{"version": profile.Version, "nickname": "负责人", "name": "负责人", "phone": "13900139001"}
	w = call(a, "PUT", "/api/admin/users/"+profile.ID, super, "", body)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	_, old, _ := recordOf[branchPhone](t.Context(), a.Store, "branch_phones", "13900139000")
	_, next, _ := recordOf[branchPhone](t.Context(), a.Store, "branch_phones", "13900139001")
	_, p, _ := recordOf[core.Partner](t.Context(), a.Store, "partners", branch.ID)
	_, account, _, _ := a.providerAccount(t.Context(), branch.ID)
	if old.PartnerID != "" || next.UserID != profile.ID || p.Phone != "13900139001" || account.Phone != p.Phone {
		t.Fatal("prebinding/account not synchronized")
	}
	// The freed number can create an ordinary user without inheriting the branch.
	bodySMS := loginChallenge(t, a, "13900139000", "app")
	w = call(a, "POST", "/api/auth/phone/login", "", "", bodySMS)
	var other struct{ Token, UserID string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &other) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if other.UserID == profile.ID || accessOf(t, a, other.Token).Active {
		t.Fatal("old number inherited authority")
	}
	phoneBranch(t, a, super, "13900139002", "reserved-phone", false)
	updated, _ := a.Store.Get(t.Context(), "users", profile.ID)
	body["version"], body["phone"] = updated.Version, "13900139002"
	if w = call(a, "PUT", "/api/admin/users/"+profile.ID, super, "", body); w.Code != 409 {
		t.Fatal("occupied branch number accepted", w.Code, w.Body.String())
	}
	after, _ := a.Store.Get(t.Context(), "users", profile.ID)
	if after.Version != updated.Version {
		t.Fatal("failed move partially persisted")
	}
}

func TestPhoneClaimSettlesPreviousPendingBind(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := phoneBranch(t, a, super, "13900139000", "pending-bind", false)
	off := false
	a.Config.SMSVerificationEnabled = &off
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx"})
	var session struct{ UserID, Token string }
	json.Unmarshal(w.Body.Bytes(), &session)
	w = call(a, "POST", "/api/access/profile", session.Token, "", map[string]string{"name": "本人", "phone": "13900139000"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	share, e := a.Partners.Share(t.Context(), branch.ID, "bind", "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = a.Partners.Join(t.Context(), session.UserID, share.Code, "scan"); e != nil {
		t.Fatal(e)
	}
	pending, _, _ := recordOf[core.Registration](t.Context(), a.Store, "registrations", session.UserID)
	w = call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "proof"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	_, registration, e := recordOf[core.Registration](t.Context(), a.Store, "registrations", session.UserID)
	if e != nil || registration.Status != "approved" {
		t.Fatal("pending review remains", e)
	}
	if _, e = a.Partners.Decide(t.Context(), session.UserID, false, "旧页面拒绝", pending.Version, "admin"); e == nil {
		t.Fatal("stale review revoked new phone binding")
	}
	if !accessOf(t, a, session.Token).Active {
		t.Fatal("phone claim not active")
	}
}

func TestBranchCreateReplayDoesNotRestoreOldDisplayedPassword(t *testing.T) {
	a, _, _ := setup(t)
	a.Integrations = settings.New(a.Store, filepath.Join(t.TempDir(), "key"), nil)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := phoneBranch(t, a, super, "13900139000", "replay-secret", true)
	row, _ := providerPasswordView(t, a, branch.ID, super)
	w := call(a, "PUT", "/api/admin/partners/"+branch.ID+"/account", super, "", map[string]any{"version": row.Version, "password": "Changed8"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	phoneBranch(t, a, super, "13900139000", "replay-secret", true)
	_, password := providerPasswordView(t, a, branch.ID, super)
	if password != "Changed8" {
		t.Fatal("idempotent replay overwrote current displayed credential")
	}
}

func TestDeletedBranchUserPhoneCanLoginWithoutInheritingBranch(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	phoneBranch(t, a, super, "13900139000", "deleted-owner", false)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "proof"})
	var old struct{ UserID string }
	json.Unmarshal(w.Body.Bytes(), &old)
	row, _ := a.Store.Get(t.Context(), "users", old.UserID)
	w = call(a, "DELETE", "/api/admin/users/"+old.UserID, super, "", map[string]any{"version": row.Version, "reason": "测试注销负责人"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	body := loginChallenge(t, a, "13900139000", "app")
	w = call(a, "POST", "/api/auth/phone/login", "", "", body)
	var fresh struct{ UserID, Token string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &fresh) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if fresh.UserID == old.UserID || accessOf(t, a, fresh.Token).Active {
		t.Fatal("deleted owner authority inherited")
	}
}

func TestBackendLoginOpenedAfterBranchPhoneClaimStillLinksUser(t *testing.T) {
	a, _ := phoneLoginFixture(t)
	super := adminLoginToken(t, a, "admin", "Tt661ea2")
	branch := phoneBranch(t, a, super, "13900139000", "late-login", false)
	w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "wx", "phoneCode": "proof"})
	var session struct{ UserID string }
	json.Unmarshal(w.Body.Bytes(), &session)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "PUT", "/api/admin/partners/"+branch.ID+"/account", super, "", map[string]any{"version": 0, "username": "later-login", "password": "Tester12", "role": "branch"})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	_, account, _, e := a.providerAccount(t.Context(), branch.ID)
	if e != nil || account.Phone != "13900139000" || account.UserID != session.UserID {
		t.Fatal("late login did not share identity", e)
	}
	if _, e = a.createBranchLogin(t.Context(), core.AdminAccount{Username: "duplicate-late", PartnerID: branch.ID, Role: "branch"}); e != core.ErrAdminPhoneTaken {
		t.Fatal("second same-phone login accepted", e)
	}
}
