package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// mp4Of is a minimal MP4 whose movie header says it lasts seconds.
func mp4Of(seconds uint32) []byte {
	mvhd := make([]byte, 20)
	binary.BigEndian.PutUint32(mvhd[12:], 1000)
	binary.BigEndian.PutUint32(mvhd[16:], seconds*1000)
	inner := append(binary.BigEndian.AppendUint32(nil, 28), append([]byte("mvhd"), mvhd...)...)
	return append(binary.BigEndian.AppendUint32(nil, uint32(8+len(inner))), append([]byte("moov"), inner...)...)
}

// 参考视频计费: the quote adds each reference video at the price of the
// shortest duration covering it, reading each video from storage once.
func TestQuoteChargesReferenceVideosByDurationTier(t *testing.T) {
	a, user, _ := setup(t)
	files := map[string][]byte{"uploads/user-a/short.mp4": mp4Of(7), "uploads/user-a/long.mp4": mp4Of(12)}
	served := 0
	oss := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served++
		_, _ = w.Write(files[strings.TrimPrefix(r.URL.Path, "/")])
	}))
	defer oss.Close()
	a.Objects = &linkedObjects{link: oss.URL, put: map[string][]byte{}}
	ctx := context.Background()
	m := core.Model{ID: "ref-billed", Key: "video-test", Kind: "video", Published: true, Available: true, Points: 9,
		Resolutions: []string{"720p"}, Ratios: []string{"9:16"}, Durations: []int{5, 10}, Modes: []string{"omni_ref"}, ReferenceTypes: []string{"video"},
		Settings: core.ModelSettings{ReferenceVideoBilling: true, PriceMatrix: map[string]map[string]float64{"5s": {"720p": 35}, "10s": {"720p": 60}}}}
	if _, err := a.Store.Put(ctx, "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0); err != nil {
		t.Fatal(err)
	}
	for id := range map[string]bool{"short": true, "long": true} {
		_, _ = a.Store.Put(ctx, "assets", core.Record{ID: id, Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/user-a/" + id + ".mp4", "type": "video/mp4", "size": 1})}, 0)
	}
	in := core.JobInput{Kind: "video", Model: m.ID, Prompt: "复刻@视频1", Resolution: "720p", Ratio: "9:16", Duration: 5, Mode: "omni_ref", Assets: []string{"short"}}
	quote := func() (int, map[string]any) {
		w := call(a, "POST", "/api/jobs/quote", user, "", in)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	for range 2 {
		if code, q := quote(); code != 200 || q["units"] != float64(9500) || q["referenceUnits"] != float64(6000) {
			t.Fatal("7 s reference should add the 10 s price", code, q)
		}
	}
	if served != 1 {
		t.Fatal("the video length is read once, got", served)
	}
	in.Assets = []string{"long"}
	if code, q := quote(); code != 400 || !strings.Contains(q["error"].(string), "10 秒") {
		t.Fatal("a reference longer than every duration is refused", code, q)
	}
	if _, err := a.Billing.Adjust(ctx, "user-a", "ref-billing-test", "admin", "测试充值", 20000); err != nil {
		t.Fatal(err)
	}
	expected := int64(9500)
	in.Assets, in.ExpectedCostUnits = []string{"short"}, &expected
	w := call(a, "POST", "/api/jobs", user, "ref-billed-key-1", in)
	var job core.Job
	if w.Code != 202 || json.Unmarshal(w.Body.Bytes(), &job) != nil || job.CostUnits != 9500 {
		t.Fatal("submit charges generation + reference", w.Code, w.Body.String())
	}
}
