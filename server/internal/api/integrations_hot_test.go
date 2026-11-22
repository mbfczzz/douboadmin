package api

import (
	"doubo/server/internal/settings"
	"encoding/json"
	"strings"
	"testing"
)

func TestThirdPartyResourceIntegrationAPIReadSaveAndRestart(t *testing.T) {
	a, admin, user := integrationAdmin(t)
	read := func() settings.State {
		t.Helper()
		w := call(a, "GET", "/api/admin/integrations", admin, "", nil)
		var out struct{ Groups []settings.State }
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		for _, g := range out.Groups {
			if g.ID == "hot" {
				if g.Name != "第三方资源配置" || len(g.Fields) != 8 {
					t.Fatal("resource integration schema is missing")
				}
				return g
			}
		}
		t.Fatal("resource integration not returned")
		return settings.State{}
	}
	initial := read()
	input := settings.Update{Version: initial.Version, Values: settings.Values{
		"TIKHUB_BASE_URL": "https://resources.fixture.example", "TIKHUB_API_KEY": "fixture-resource-key",
		"HOT_FEED_SOURCE": "search", "HOT_FEED_KEYWORDS": "剧情带货,探店",
		"HOT_CACHE_FEED_MINUTES": "60", "HOT_CACHE_SEARCH_MINUTES": "10",
		"HOT_CACHE_WORDS_MINUTES": "20", "HOT_CACHE_VIDEO_MINUTES": "45",
	}}
	w := call(a, "PUT", "/api/admin/integrations/hot", admin, "", input)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	saved := read()
	if !saved.PendingRestart || saved.Version != 1 || saved.Source != "database" || saved.Values["HOT_CACHE_VIDEO_MINUTES"] != "45" {
		t.Fatal("saved state/version did not update")
	}
	row, _ := a.Store.Get(t.Context(), "integration_settings", "hot")
	if strings.Contains(string(row.Data), "fixture-resource-key") {
		t.Fatal("resource key stored in plaintext")
	}
	for _, method := range []string{"GET", "PUT"} {
		path := "/api/admin/integrations"
		if method == "PUT" {
			path += "/hot"
		}
		if w := call(a, method, path, user, "", input); w.Code != 403 {
			t.Fatal("resource credentials accessible outside super administrator role", w.Code)
		}
	}
	input.Version = 1
	input.Values["HOT_CACHE_FEED_MINUTES"] = "2"
	if w := call(a, "PUT", "/api/admin/integrations/hot", admin, "", input); w.Code != 400 || !strings.Contains(w.Body.String(), `"field":"HOT_CACHE_FEED_MINUTES"`) {
		t.Fatal("cache validation missing", w.Code)
	}
	if read().Version != 1 {
		t.Fatal("failed validation changed settings")
	}
	values, err := a.Integrations.LoadStartup(t.Context())
	if err != nil || values["TIKHUB_API_KEY"] != "fixture-resource-key" || read().PendingRestart {
		t.Fatal("resource settings not applied after startup", err)
	}
	if w := call(a, "GET", "/api/config", user, "", nil); strings.Contains(w.Body.String(), "fixture-resource-key") {
		t.Fatal("resource key exposed to the mini program")
	}
}
