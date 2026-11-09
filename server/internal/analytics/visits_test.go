package analytics

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestPageViewValid(t *testing.T) {
	ok := PageView{VisitID: "visit-0123456789ab", VisitorID: "visitor_0123456789", Page: "pages/create/index", Scene: 1001, Platform: "iOS"}
	if !ok.Valid() || ok.Platform != "ios" {
		t.Fatal("valid view rejected", ok)
	}
	for name, edit := range map[string]func(*PageView){
		"short id":     func(v *PageView) { v.VisitID = "short" },
		"long id":      func(v *PageView) { v.VisitorID = strings.Repeat("a", 65) },
		"bad id chars": func(v *PageView) { v.VisitID = "visit 0123456789ab" },
		"page prefix":  func(v *PageView) { v.Page = "/pages/create/index" },
		"page suffix":  func(v *PageView) { v.Page = "pages/create/detail" },
		"long page":    func(v *PageView) { v.Page = "pages/" + strings.Repeat("a", 50) + "/index" },
		"scene":        func(v *PageView) { v.Scene = -1 },
		"platform":     func(v *PageView) { v.Platform = strings.Repeat("x", 17) },
	} {
		v := ok
		edit(&v)
		if v.Valid() {
			t.Fatal(name, "accepted", v)
		}
	}
}

func TestVisitsRecordAndDashboard(t *testing.T) {
	ctx, s := context.Background(), store.NewMemory()
	v := &Visits{Store: s}
	now := time.Now().UTC()
	view := func(visit, visitor, page string, at time.Time) {
		if err := v.Record(ctx, PageView{VisitID: visit, VisitorID: visitor, Page: page, Scene: 1001, Platform: "ios"}, at); err != nil {
			t.Fatal(err)
		}
	}
	view("visit-aaaaaaaaaaaaaaaa", "visitor-aaaaaaaaaaaa", "pages/templates/index", now)
	view("visit-aaaaaaaaaaaaaaaa", "visitor-aaaaaaaaaaaa", "pages/templates/index", now.Add(time.Second)) // repeat within 2s
	view("visit-aaaaaaaaaaaaaaaa", "visitor-aaaaaaaaaaaa", "pages/create/index", now.Add(30*time.Second))
	view("visit-bbbbbbbbbbbbbbbb", "visitor-aaaaaaaaaaaa", "pages/mine/index", now.Add(time.Minute))
	view("visit-cccccccccccccccc", "visitor-cccccccccccc", "pages/create/index", now)
	row, err := s.Get(ctx, "visits", core.Digest("visit:visit-aaaaaaaaaaaaaaaa")[:32])
	if err != nil || row.Owner != "" {
		t.Fatal("visit must be stored without an owner", row, err)
	}
	var first core.Visit
	_ = json.Unmarshal(row.Data, &first)
	if first.Pages != 2 || first.Entry != "pages/templates/index" || first.LastAt.Sub(first.FirstAt) != 30*time.Second || strings.Contains(string(row.Data), "visitor-aaaa") {
		t.Fatal("visit record", string(row.Data))
	}
	out, err := s.Dashboard(ctx, 7)
	if err != nil {
		t.Fatal(err)
	}
	tr := out.Breakdown.Traffic
	if tr.PV != 4 || tr.UV != 2 || tr.Visits != 3 || tr.NewVisitors != 2 || tr.AvgVisitSeconds != 10 {
		t.Fatal("dashboard traffic", tr)
	}
}

func TestVisitsCapPagesAndIgnoreStaleVisits(t *testing.T) {
	ctx, s := context.Background(), store.NewMemory()
	v := &Visits{Store: s}
	now := time.Now().UTC()
	id := "visit-dddddddddddddddd"
	for i := 0; i < maxPageKeys+5; i++ {
		page := "pages/p" + strings.Repeat("x", i%40) + "/index"
		if err := v.Record(ctx, PageView{VisitID: id, VisitorID: "visitor-dddddddddddd", Page: page}, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	_ = v.Record(ctx, PageView{VisitID: id, VisitorID: "visitor-dddddddddddd", Page: "pages/late/index"}, now.Add(13*time.Hour))
	row, _ := s.Get(ctx, "visits", core.Digest("visit:" + id)[:32])
	var visit core.Visit
	_ = json.Unmarshal(row.Data, &visit)
	if len(visit.Counts) != maxPageKeys || visit.Pages != maxPageKeys+5 || visit.Platform != "unknown" {
		t.Fatal("caps", len(visit.Counts), visit.Pages, visit.Platform)
	}
}

func TestPageViewValidPerClient(t *testing.T) {
	ids := func(v PageView) PageView {
		v.VisitID, v.VisitorID = "visit-0123456789abcdef", "visitor-0123456789abcd"
		return v
	}
	cases := []struct {
		in   PageView
		ok   bool
		page string
	}{
		{PageView{Page: "pages/create/index"}, true, "pages/create/index"}, // old clients: mini-program
		{PageView{Client: "web", Page: "/s/abcDEF123", Source: "Weibo.com"}, true, "/s/*"},
		{PageView{Client: "web", Page: "/pricing"}, true, "/pricing"},
		{PageView{Client: "web", Page: "pages/create/index"}, false, ""},
		{PageView{Client: "app", Page: "CreateScreen", Source: "appstore"}, true, "CreateScreen"},
		{PageView{Client: "app", Page: "/create"}, false, ""},
		{PageView{Client: "tv", Page: "home"}, false, ""},
		{PageView{Client: "web", Page: "/", Source: "bad source!"}, false, ""},
	}
	for _, c := range cases {
		v := ids(c.in)
		if v.Valid() != c.ok || (c.ok && v.Page != c.page) {
			t.Fatalf("%+v: valid=%v page=%q", c.in, !c.ok, v.Page)
		}
	}
}
