package api

import (
	"image/png"
	"strings"
	"testing"
)

func TestCodePosterImageKeepsAuthorizationAndCodeVersion(t *testing.T) {
	a, _, _ := activationFixture(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	id := createProvider(t, a, admin, "poster-s1", createBranch(t, a, admin, "poster"), "华东", "s1", map[string]string{"username": "poster-s1", "password": "poster-password-2026"})
	code := providerCode(t, a, "GET", id, "member", admin)
	path := "/api/admin/partners/" + id + "/codes/member?image=1&code=" + code.Code
	denied := call(a, "GET", path, "", "", nil)
	if denied.Code < 400 {
		t.Fatal("anonymous code image accessible")
	}
	image := call(a, "GET", path, admin, "", nil)
	if image.Code != 200 || image.Header().Get("Content-Type") != "image/png" {
		t.Fatal(image.Code, image.Body.String())
	}
	if _, err := png.Decode(image.Body); err != nil {
		t.Fatal(err)
	}
	stale := call(a, "GET", strings.Replace(path, code.Code, "OLD23456", 1), admin, "", nil)
	if stale.Code != 409 {
		t.Fatal("mismatched printed code accepted", stale.Code)
	}
}
