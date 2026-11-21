package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"testing"
)

// 功能使用: taps on entries are counted anonymously, submitted tasks count as
// uses of the preset (or kind) they came from, and the admin sees both per
// function, most used first, with a daily trend.
func TestFeatureClicksAndUses(t *testing.T) {
	a, one, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	for _, key := range []string{"tryon", "tryon", "tryon", "idphoto", "unknown"} {
		if w := call(a, "POST", "/api/features/"+key+"/click", "", "", nil); w.Code != 204 {
			t.Fatal(w.Code)
		}
	}
	submit := func(key string, in core.JobInput) {
		in.Kind, in.Model, in.Resolution, in.Ratio, in.Assets = "image", "demo-image", "1K", "1:1", []string{}
		if w := call(a, "POST", "/api/jobs", one, key, in); w.Code != 202 && w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	submit("job-key-0001", core.JobInput{Prompt: "证件照", Feature: "idphoto"})
	submit("job-key-0002", core.JobInput{Prompt: "证件照 2", Feature: "idphoto"})
	submit("job-key-0002", core.JobInput{Prompt: "证件照 2", Feature: "idphoto"}) // the same request again
	submit("job-key-0003", core.JobInput{Prompt: "一张图", Feature: "bogus"})
	if w := call(a, "POST", "/api/features/extract/use", one, "", nil); w.Code != 204 {
		t.Fatal(w.Code)
	}
	if w := call(a, "GET", "/api/admin/feature-stats?days=1", one, "", nil); w.Code < 400 {
		t.Fatal("a user read the statistics")
	}
	var r struct {
		Features []featureRow  `json:"features"`
		Trend    []featureStat `json:"trend"`
	}
	w := call(a, "GET", "/api/admin/feature-stats?days=7", admin, "", nil)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &r) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	got := map[string]string{}
	for _, f := range r.Features {
		got[f.Key] = fmt.Sprint(f.Clicks, "/", f.Uses)
	}
	if got["tryon"] != "3/0" || got["idphoto"] != "1/2" || got["image"] != "0/1" || got["extract"] != "0/1" || len(r.Features) != len(core.Features) {
		t.Fatal(got)
	}
	if r.Features[0].Key != "idphoto" || len(r.Trend) != 7 || r.Trend[6].Clicks != 4 || r.Trend[6].Uses != 4 {
		t.Fatalf("%+v %+v", r.Features[0], r.Trend[6])
	}
	// Taps have their own, higher cap than visit beacons.
	for range visitsPerMinute + 10 {
		call(a, "POST", "/api/features/hot/click", "", "", nil)
	}
	_ = json.Unmarshal(call(a, "GET", "/api/admin/feature-stats?days=1", admin, "", nil).Body.Bytes(), &r)
	for _, f := range r.Features {
		if f.Key == "hot" && f.Clicks != visitsPerMinute+10 {
			t.Fatal("taps dropped", f.Clicks)
		}
	}
	// Agent turns and template jobs are theirs, AI写剧本 is no function.
	for want, in := range map[string]core.JobInput{"agent": {Kind: "chat", SessionID: "s"}, "template": {Kind: "video", TemplateID: "t", Feature: "ad"}, "": {Kind: "chat"}, "remake": {Kind: "video", Feature: "remake"}, "mix": {Kind: "mix"}} {
		if got := core.JobFeature(in); got != want {
			t.Fatal(want, got)
		}
	}
}
