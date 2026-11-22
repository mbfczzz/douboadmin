package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/vision"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const watched = `{"choices":[{"message":{"content":"{\"summary\":\"女生在窗边拍写真\",\"hook\":\"逆光回眸\",\"structure\":\"开场→换装→收尾\",\"style\":\"日系柔光\",\"shots\":[{\"start\":0,\"end\":3,\"scene\":\"窗边\",\"action\":\"回头微笑\",\"speech\":\"\"}]}"}}]}`

// A named video is watched once by 视频理解 and told to the chat model as text.
func TestNamedVideosAreWatchedAndRemembered(t *testing.T) {
	s, p, j, bodies := directFixture(t, `{"choices":[{"message":{"content":"这是一条日系写真"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}`, 200)
	watches := 0
	eye := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(raw), `"video_url"`) {
			t.Error("the video was not sent to 视频理解")
		}
		watches++
		_, _ = io.WriteString(w, watched)
	}))
	defer eye.Close()
	p.Vision = &vision.Client{BaseURL: eye.URL, Key: "k", Model: "seed-vision"}
	_, _ = s.Put(t.Context(), "assets", core.Record{ID: "v1", Owner: "u", Data: core.Data(map[string]any{"type": "video/mp4", "size": 1 << 20})}, 0)
	p.Assets = func(context.Context, core.Job) ([]core.Reference, error) {
		return []core.Reference{{URL: "https://x/v.mp4", Type: "video"}}, nil
	}
	j.Input.Assets = []string{"v1"}
	if text, err := p.Generate(t.Context(), j); err != nil || text != "这是一条日系写真" {
		t.Fatal(text, err)
	}
	raw, _ := json.Marshal((*bodies)[0]["messages"])
	if !strings.Contains(string(raw), "由视频理解模型观看后整理") || !strings.Contains(string(raw), "逆光回眸") || strings.Contains(string(raw), "video_url") {
		t.Fatal(string(raw))
	}
	// Asked again: the note is reused, the video is not watched again.
	note := p.videoNote(t.Context(), j, "v1", "https://x/v.mp4")
	if watches != 1 || !strings.Contains(note, "女生在窗边拍写真") {
		t.Fatal(watches, note)
	}
}

// Without 视频理解 the model is told it cannot see the video (no pretending).
func TestUnwatchableVideosAreSaidSo(t *testing.T) {
	_, p, j, _ := directFixture(t, `{}`, 200)
	if note := p.videoNote(t.Context(), j, "v1", "https://x/v.mp4"); !strings.Contains(note, "暂时看不到这个视频的画面") {
		t.Fatal(note)
	}
}

// Attached pictures are named as the project numbers them, so a plan's
// @图片3 means the right picture.
func TestAttachedPicturesAreNamedAsInTheProject(t *testing.T) {
	s, p, j, bodies := directFixture(t, `{"choices":[{"message":{"content":"好"}}]}`, 200)
	for _, id := range []string{"a", "b", "c"} {
		_, _ = s.Put(t.Context(), "assets", core.Record{ID: id, Owner: "u", Data: core.Data(map[string]any{"type": "image/png"})}, 0)
	}
	_, _ = s.Put(t.Context(), "agent_sessions", core.Record{ID: "proj", Owner: "u", Data: core.Data(core.AgentSession{Skill: "general", Assets: []string{"a", "b", "c"}})}, 0)
	row, _ := s.Get(t.Context(), "models", "ds")
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.ReferenceTypes = []string{"image"}
	_, _ = s.Put(t.Context(), "models", core.Record{ID: "ds", Data: core.Data(m)}, row.Version)
	j.Input.SessionID, j.Input.Assets = "proj", []string{"c"}
	if _, err := p.Generate(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal((*bodies)[0]["messages"])
	if !strings.Contains(string(raw), "这条消息附带的素材依次是：图片3") {
		t.Fatal(string(raw))
	}
}

// A model that watches videos itself (豆包) gets the video directly; 视频理解
// is not called.
func TestVideosGoStraightToModelsThatWatchThem(t *testing.T) {
	s, p, j, bodies := directFixture(t, `{"choices":[{"message":{"content":"一条写真"}}],"usage":{"prompt_tokens":9000,"completion_tokens":5}}`, 200)
	watches := 0
	eye := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { watches++ }))
	defer eye.Close()
	p.Vision = &vision.Client{BaseURL: eye.URL, Key: "k", Model: "seed-vision"}
	row, _ := s.Get(t.Context(), "models", "ds")
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.ReferenceTypes = []string{"image", "video"}
	_, _ = s.Put(t.Context(), "models", core.Record{ID: "ds", Data: core.Data(m)}, row.Version)
	_, _ = s.Put(t.Context(), "assets", core.Record{ID: "v1", Owner: "u", Data: core.Data(map[string]any{"type": "video/mp4"})}, 0)
	_, _ = s.Put(t.Context(), "agent_sessions", core.Record{ID: "proj", Owner: "u", Data: core.Data(core.AgentSession{Skill: "general", Assets: []string{"v1"}})}, 0)
	p.Assets = func(context.Context, core.Job) ([]core.Reference, error) {
		return []core.Reference{{URL: "https://x/v.mp4", Type: "video"}}, nil
	}
	j.Input.Assets, j.Input.SessionID = []string{"v1"}, "proj"
	if text, err := p.Generate(t.Context(), j); err != nil || text != "一条写真" {
		t.Fatal(text, err)
	}
	raw, _ := json.Marshal((*bodies)[0]["messages"])
	if !strings.Contains(string(raw), `"video_url":{"fps":1,"url":"https://x/v.mp4"}`) || !strings.Contains(string(raw), "附带的素材依次是：视频1") || watches != 0 {
		t.Fatal(watches, string(raw))
	}
}
