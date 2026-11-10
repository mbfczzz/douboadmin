package api

import (
	"encoding/json"
	"testing"

	"doubo/server/internal/core"
)

func awaitingBrowser(t *testing.T, kind string) (*Server, string, string) {
	t.Helper()
	a, user, admin := activationFixture(t)
	branch := newBranch(t, a, "browse")
	code := ""
	if kind == "promo" {
		_, e := a.Store.Put(t.Context(), "users", core.Record{ID: "referrer", Data: core.Data(registeredProfile("推荐人"))}, 0)
		if e != nil {
			t.Fatal(e)
		}
		joinPartner(t, a, branch, "referrer")
		code, e = a.Partners.PromoCode(t.Context(), "referrer")
		if e != nil {
			t.Fatal(e)
		}
	} else {
		code = providerCode(t, a, "GET", branch, kind, admin).Code
	}
	if status, body := joinHTTP(a, user, code); status != 200 {
		t.Fatal("scan failed", status, body)
	} else {
		var access accessView
		if json.Unmarshal([]byte(body), &access) != nil || access.Active || !access.CanBrowse || access.Status != "review" {
			t.Fatal("scan response does not permit read-only entry", body)
		}
	}
	row, _ := a.Store.Get(t.Context(), "models", "demo-image")
	var model core.Model
	_ = json.Unmarshal(row.Data, &model)
	model.Points, model.Settings.CostUSD = 2, "9.999"
	row.Data = core.Data(model)
	if _, e := a.Store.Put(t.Context(), "models", row, row.Version); e != nil {
		t.Fatal(e)
	}
	for _, published := range []bool{true, false} {
		id, title := "visible-template", "可浏览模板"
		if !published {
			id, title = "hidden-template", "内部未上架"
		}
		template := core.Template{Kind: "image", Title: title, Prompt: "example", Published: published}
		template.Model = model.ID
		_, e := a.Store.Put(t.Context(), "templates", core.Record{ID: id, Data: core.Data(template)}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	return a, user, admin
}
