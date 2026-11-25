package arkvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"testing"
)

func roles(body map[string]any) []string {
	out := []string{}
	for _, item := range body["content"].([]any)[1:] {
		out = append(out, item.(map[string]any)["role"].(string))
	}
	return out
}

// Each mode maps to 方舟's content roles; first-frame tasks follow the picture.
func TestBodyMapsModesToContentRoles(t *testing.T) {
	img := core.Reference{Type: "image", URL: "https://oss/i.jpg"}
	vid := core.Reference{Type: "video", URL: "https://oss/v.mp4"}
	aud := core.Reference{Type: "audio", URL: "https://oss/a.mp3"}
	in := core.JobInput{Kind: "video", Prompt: "海边", Resolution: "720P", Ratio: "9:16", Duration: 5}
	body, err := Body("doubao-seedance-2-0-260128", in, nil)
	if err != nil || body["ratio"] != "9:16" || body["resolution"] != "720p" || body["duration"] != 5 || len(roles(body)) != 0 || body["watermark"] != false {
		t.Fatal("t2v", body, err)
	}
	body, _ = Body("m", in, []core.Reference{img})
	if r := roles(body); len(r) != 1 || r[0] != "first_frame" || body["ratio"] != "adaptive" {
		t.Fatal("one picture is the first frame", body)
	}
	in.Mode = "keyframe"
	body, _ = Body("m", in, []core.Reference{img, img})
	if r := roles(body); len(r) != 2 || r[0] != "first_frame" || r[1] != "last_frame" {
		t.Fatal("keyframe", r)
	}
	in.Mode = "omni_ref"
	body, _ = Body("m", in, []core.Reference{img, vid, aud})
	if r := roles(body); len(r) != 3 || r[0] != "reference_image" || r[1] != "reference_video" || r[2] != "reference_audio" || body["ratio"] != "9:16" {
		t.Fatal("omni", r, body)
	}
	video := body["content"].([]any)[2].(map[string]any)
	if video["type"] != "video_url" || video["video_url"].(map[string]string)["url"] != vid.URL {
		t.Fatal("video item", video)
	}
	in.Mode = "i2v"
	if _, err := Body("m", in, []core.Reference{img, vid}); err == nil {
		t.Fatal("a video in first-frame mode accepted")
	}
}

// Ensure lists the five models with their official capabilities, keeps the
// operator's edits, restores the fixed fields, and never revives a deletion.
func TestEnsureKeepsOperatorEditsAndOfficialCapabilities(t *testing.T) {
	ctx, s := context.Background(), store.NewMemory()
	if err := Ensure(ctx, s, false); err != nil {
		t.Fatal(err)
	}
	read := func(id string) (core.Model, int64) {
		row, err := s.Get(ctx, "models", ModelID(id))
		if err != nil {
			t.Fatal(err)
		}
		var m core.Model
		_ = json.Unmarshal(row.Data, &m)
		return m, row.Version
	}
	m, v := read("doubao-seedance-2-5-260628")
	if m.Key != "arkvideo:doubao-seedance-2-5-260628" || m.Available || len(m.Durations) != 27 || m.Durations[26] != 30 || len(m.Resolutions) != 4 ||
		m.Settings.VideoTokenPrices["1080p"].Plain != 770 || m.Settings.VideoTokenPrices["720p"].WithVideo != 420 || m.Settings.RefLimits["omniRef.imageCount"] != 20 {
		t.Fatalf("Seedance 2.5 %+v", m)
	}
	if err := m.Settings.Validate(m); err != nil {
		t.Fatal("the default settings must pass the console's validation:", err)
	}
	mini, _ := read("doubao-seedance-2-0-mini-260615")
	if len(mini.Durations) != 12 || len(mini.Resolutions) != 2 || mini.Settings.VideoTokenPrices["720p"].Plain != 230 {
		t.Fatalf("mini %+v", mini)
	}
	m.Name, m.Sort, m.Resolutions = "我的 2.5", 1, []string{"480p"}
	m.Settings.VideoTokenPrices = map[string]core.VideoTokenPrice{"720p": {Plain: 999, WithVideo: 1}}
	_, _ = s.Put(ctx, "models", core.Record{ID: m.ID, Data: core.Data(m)}, v)
	deleted, dv := read("doubao-seedance-2-0-fast-260128")
	deleted.Deleted = true
	_, _ = s.Put(ctx, "models", core.Record{ID: deleted.ID, Data: core.Data(deleted)}, dv)
	if err := Ensure(ctx, s, true); err != nil {
		t.Fatal(err)
	}
	m, _ = read("doubao-seedance-2-5-260628")
	if m.Name != "我的 2.5" || m.Sort != 1 || len(m.Resolutions) != 4 || !m.Available || m.Settings.VideoTokenPrices["720p"].Plain != 999 {
		t.Fatalf("edits kept, capabilities restored %+v", m)
	}
	if again, _ := read("doubao-seedance-2-0-fast-260128"); !again.Deleted {
		t.Fatal("a deleted model came back")
	}
}

// 方舟's own limits are checked before a task is paid for.
func TestCheckReferences(t *testing.T) {
	audio := map[string]int{"audio": 1}
	if CheckReferences("doubao-seedance-2-0-260128", audio, nil) == nil {
		t.Fatal("2.0 took audio alone")
	}
	if err := CheckReferences("doubao-seedance-2-5-260628", audio, nil); err != nil {
		t.Fatal("2.5 takes audio alone", err)
	}
	videos := map[string]int{"video": 2}
	if CheckReferences("doubao-seedance-2-0-fast-260128", videos, []float64{8, 8}) == nil {
		t.Fatal("16 s of reference video on 2.0")
	}
	if err := CheckReferences("doubao-seedance-2-5-flash-261115", videos, []float64{15, 15.05}); err != nil {
		t.Fatal("30 s on 2.5 (with a frame of slack)", err)
	}
}

// An operator can narrow a fixed model's parameters, never widen them, and
// every resolution it offers needs a price; tasks end within 方舟's hour.
func TestOperatorCannotWidenOrUnpriceAFixedModel(t *testing.T) {
	spec, _ := Find("doubao-seedance-2-0-mini-260615")
	m := core.Model{ID: ModelID(spec.ID), Published: true, Available: true, Settings: spec.Defaults()}
	spec.Apply(&m)
	m.Settings.Resolutions, m.Settings.Durations = []string{"720p", "1080p"}, []int{2, 5, 20}
	e := m.Effective()
	if len(e.Resolutions) != 1 || e.Resolutions[0] != "720p" || len(e.Durations) != 1 || e.Durations[0] != 5 {
		t.Fatal("widened", e.Resolutions, e.Durations)
	}
	unpriced := spec.Defaults()
	delete(unpriced.VideoTokenPrices, "720p")
	if err := unpriced.Validate(m); err == nil {
		t.Fatal("an offered resolution without a price was saved")
	}
	body, _ := Body(spec.ID, core.JobInput{Kind: "video", Resolution: "720p", Duration: 5}, nil)
	if body["execution_expires_after"] != 3600 {
		t.Fatal(body)
	}
}
