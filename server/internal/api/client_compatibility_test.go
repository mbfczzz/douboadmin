package api

import (
	"bytes"
	"doubo/server/internal/arkvideo"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

func legacyCall(a *Server, method, path, token, key string, body any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, bytes.NewReader(raw))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}

func TestLegacyMiniProgramGetsConservativeVisitorBehavior(t *testing.T) {
	a, user, admin := activationFixture(t)
	if w := call(a, "PUT", "/api/admin/signup", admin, "", map[string]any{"version": 0, "openSignup": true}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var legacy accessView
	w := legacyCall(a, "GET", "/api/access", user, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &legacy) != nil || legacy.OpenSignup || legacy.CanBrowse {
		t.Fatal("legacy signup capability leaked", w.Code, w.Body.String())
	}
	if w = legacyCall(a, "POST", "/api/access/direct", user, "", map[string]any{}); w.Code != 409 || !strings.Contains(w.Body.String(), "更新小程序") {
		t.Fatal("legacy direct signup was not refused safely", w.Code, w.Body.String())
	}
	if _, err := a.Store.Get(t.Context(), "registrations", "user-a"); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("legacy request changed registration", err)
	}
	if w = call(a, "POST", "/api/access/direct", user, "", map[string]any{}); w.Code != 200 {
		t.Fatal("modern direct signup failed", w.Code, w.Body.String())
	}
	w = legacyCall(a, "GET", "/api/access", user, "", nil)
	if json.Unmarshal(w.Body.Bytes(), &legacy) != nil || legacy.Status != "review" || !legacy.Active || !legacy.CanBrowse {
		t.Fatal("legacy visitor did not enter compatibility browsing", w.Body.String())
	}
	if stored, err := a.Partners.Access(t.Context(), "user-a"); err != nil || stored.Active || stored.Status != "review" {
		t.Fatal("compatibility response changed stored access", stored, err)
	}
	if w = legacyCall(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("legacy visitor remained stuck outside browsing", w.Code)
	}
	if w = legacyCall(a, "POST", "/api/jobs", user, "legacy-write", map[string]any{}); w.Code != 403 || !strings.Contains(w.Body.String(), `"canBrowse":true`) {
		t.Fatal("legacy visitor write redirects instead of explaining", w.Code, w.Body.String())
	}
	if w = call(a, "GET", "/api/templates", user, "", nil); w.Code != 200 {
		t.Fatal("modern visitor lost browsing", w.Code, w.Body.String())
	}
}

func TestLegacyInviteRegistrationEntersBrowseWithoutOpeningRole(t *testing.T) {
	a, user, admin := activationFixture(t)
	branch := newBranch(t, a, "legacy-invite")
	share := providerCode(t, a, "GET", branch, "member", admin)
	w := legacyCall(a, "POST", "/api/access/join", user, "", map[string]any{"code": share.Code, "method": "scan"})
	var view accessView
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &view) != nil || !view.Active || !view.CanBrowse || view.Status != "review" {
		t.Fatal("legacy invite remained stuck", w.Code, w.Body.String())
	}
	stored, err := a.Partners.Access(t.Context(), "user-a")
	if err != nil || stored.Active || stored.Status != "review" || stored.PartnerID != branch {
		t.Fatal("compatibility response opened the requested role", stored, err)
	}
}

func TestLegacyMiniProgramDoesNotReceiveNewVideoBillingModels(t *testing.T) {
	a, _, _ := setup(t)
	id := templateVideoModel(t, a)
	row, _ := a.Store.Get(t.Context(), "models", id)
	var model core.Model
	_ = json.Unmarshal(row.Data, &model)
	model.Settings.ReferenceVideoBilling = true
	row.Data = core.Data(model)
	if _, err := a.Store.Put(t.Context(), "models", row, row.Version); err != nil {
		t.Fatal(err)
	}
	if err := arkvideo.Ensure(t.Context(), a.Store, true); err != nil {
		t.Fatal(err)
	}
	template := core.Template{Title: "新计费模板", Category: "新计费", Kind: "video", Published: true, GenerationOptions: core.GenerationOptions{Model: id}}
	if _, err := a.Store.Put(t.Context(), "templates", core.Record{ID: "new-billing-template", Data: core.Data(template)}, 0); err != nil {
		t.Fatal(err)
	}
	modern := call(a, "GET", "/api/config", "", "", nil).Body.String()
	legacy := legacyCall(a, "GET", "/api/config", "", "", nil).Body.String()
	if !strings.Contains(modern, id) || !strings.Contains(modern, "arkvideo-") || !strings.Contains(modern, "新计费") {
		t.Fatal("modern catalog lost new models", modern)
	}
	if strings.Contains(legacy, id) || strings.Contains(legacy, "arkvideo-") || strings.Contains(legacy, "新计费") || !strings.Contains(legacy, "demo-image") {
		t.Fatal("legacy catalog is unsafe or empty", legacy)
	}
	if body := call(a, "GET", "/api/templates", "", "", nil).Body.String(); !strings.Contains(body, "new-billing-template") {
		t.Fatal("modern templates lost compatible model", body)
	}
	if body := legacyCall(a, "GET", "/api/templates", "", "", nil).Body.String(); strings.Contains(body, "new-billing-template") {
		t.Fatal("legacy templates exposed a hidden model", body)
	}
}
