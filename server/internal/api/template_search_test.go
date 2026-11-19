package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/url"
	"testing"
)

// Users search titles, descriptions and categories across every category;
// private recipe prompts and cover URLs never match.
func TestUserTemplateSearchMatchesVisibleTextOnly(t *testing.T) {
	a, token, _ := setup(t)
	model := templateVideoModel(t, a)
	for id, tpl := range map[string]core.Template{
		"community": {Title: "W01 社区日常综合宣传", Category: "万科物业专项", Prompt: "私有配方 秘密词"},
		"rider":     {Title: "神秘女骑手", Category: "奇幻叙事", Description: "夜色街头的机车追逐"},
	} {
		tpl.Kind, tpl.Published, tpl.Model, tpl.Cover = "video", true, model, "https://cdn.test/cover-w01.jpg"
		if _, e := a.Store.Put(t.Context(), "templates", core.Record{ID: id, Data: core.Data(tpl)}, 0); e != nil {
			t.Fatal(e)
		}
	}
	search := func(q string) []string {
		t.Helper()
		w := call(a, "GET", "/api/templates?kind=video&category=推荐&page=1&size=10&q="+url.QueryEscape(q), token, "", nil)
		var page core.RecordPage
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		ids := []string{}
		for _, row := range page.Items {
			ids = append(ids, row.ID)
		}
		return ids
	}
	for q, want := range map[string]string{"宣传": "community", "机车": "rider", "奇幻": "rider"} {
		if got := search(q); len(got) != 1 || got[0] != want {
			t.Fatalf("search %q = %v, want %s", q, got, want)
		}
	}
	for _, q := range []string{"秘密词", "cdn.test", "community"} {
		if got := search(q); len(got) != 0 {
			t.Fatalf("search %q leaked hidden fields: %v", q, got)
		}
	}
}
