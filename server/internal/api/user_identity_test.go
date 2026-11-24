package api

import (
	"encoding/json"
	"testing"

	"doubo/server/internal/partners"
)

func TestSuperAdminChangesUserBusinessIdentity(t *testing.T) {
	a, user, admin := activationFixture(t)
	path := "/api/admin/users/user-a/business-identity"
	if w := call(a, "GET", path, user, "", nil); w.Code != 403 {
		t.Fatal("user changed identity", w.Code)
	}
	var current partners.IdentityAssignment
	w := call(a, "GET", path, admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &current) != nil || current.Kind != "visitor" {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call(a, "PUT", path, admin, "", map[string]any{"version": current.Version, "kind": "member", "parentId": "root"})
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &current) != nil || current.Kind != "member" || current.PartnerID != "root" {
		t.Fatal("member conversion", w.Code, w.Body.String())
	}
	w = call(a, "PUT", path, admin, "", map[string]any{"version": current.Version, "kind": "visitor"})
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &current) != nil || current.Kind != "visitor" || current.PreviousKind != "member" {
		t.Fatal("visitor conversion", w.Code, w.Body.String())
	}
	if access := accessOf(t, a, user); access.Active || access.Status != "review" {
		t.Fatal("visitor retained active access", access)
	}
}
