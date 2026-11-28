package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// secFixture: user-a signed in with WeChat; WeChat finds text containing
// "违规词" risky and answers media checks with a trace id.
func secFixture(t *testing.T) (*Server, string, *[]string) {
	a, one, _ := setup(t)
	enableWeChat(a)
	_, _ = a.Store.Put(t.Context(), "wechat_identities", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(map[string]string{"openid": "openid-a"})}, 0)
	var mu sync.Mutex
	asked := &[]string{}
	a.WeChat.HTTP = wxTransport(func(r *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(r.Body)
		mu.Lock()
		*asked = append(*asked, r.URL.Path+" "+string(raw))
		mu.Unlock()
		body := `{"access_token":"private-token","expires_in":7200}`
		switch r.URL.Path {
		case "/wxa/msg_sec_check":
			body = `{"errcode":0,"errmsg":"ok","result":{"suggest":"pass","label":100}}`
			if strings.Contains(string(raw), "违规词") {
				body = `{"errcode":0,"errmsg":"ok","result":{"suggest":"risky","label":20002}}`
			}
		case "/wxa/media_check_async":
			body = `{"errcode":0,"errmsg":"ok","trace_id":"trace-1"}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	return a, one, asked
}

func TestRiskyTextIsRefusedAndPassingTextGoesThrough(t *testing.T) {
	a, one, asked := secFixture(t)
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "画一张含违规词的图", Resolution: "1K", Ratio: "1:1", Assets: []string{}}
	w := call(a, "POST", "/api/jobs", one, "risky-key", in)
	if w.Code != 400 || !strings.Contains(w.Body.String(), unsafeText) {
		t.Fatal(w.Code, w.Body.String())
	}
	if !strings.Contains(strings.Join(*asked, "\n"), `"openid":"openid-a"`) || !strings.Contains(strings.Join(*asked, "\n"), `"version":2`) {
		t.Fatal("msgSecCheck v2 with the user's openid not used", *asked)
	}
	// The admin sees what was refused, where and why.
	entry := waitLog(t, a, core.AuditQuery{Categories: []string{core.LogSecurity}}, func(e core.AuditEntry) bool { return e.Error != "" })
	if entry.ActorID != "user-a" || entry.Summary != "违规 · 色情" || entry.Error != "微信判定违规（色情），已拦截「提交生成任务」" {
		t.Fatal(entry)
	}
	in.Prompt = "画一只猫"
	if w = call(a, "POST", "/api/jobs", one, "clean-key", in); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(a, "PUT", "/api/me", one, "", map[string]string{"nickname": "违规词"}); w.Code != 400 || !strings.Contains(w.Body.String(), unsafeText) {
		t.Fatal("risky nickname kept", w.Code, w.Body.String())
	}
}

func TestTextPassesWhenWeChatCannotJudge(t *testing.T) {
	a, one, _ := secFixture(t)
	a.WeChat.HTTP = wxTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 502, Body: io.NopCloser(strings.NewReader("bad gateway"))}, nil
	})
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "违规词", Resolution: "1K", Ratio: "1:1", Assets: []string{}}
	if w := call(a, "POST", "/api/jobs", one, "outage-key", in); w.Code != 202 {
		t.Fatal("an outage stopped creating", w.Code, w.Body.String())
	}
}

func TestLongTextIsCheckedInPieces(t *testing.T) {
	got := pieces(strings.Repeat("字", 2500*5+10), 2500, 4)
	if len(got) != 4 || len([]rune(got[0])) != 2500 {
		t.Fatal(len(got))
	}
	if len(pieces("", 2500, 4)) != 0 {
		t.Fatal("empty text checked")
	}
}

type checkStore struct{ Objects }

func (checkStore) CheckURL(_ context.Context, key, kind string, ms int) (string, error) {
	return "https://oss.test/" + key + "?kind=" + kind, nil
}

func TestUploadIsJudgedAndARiskyOneCannotBeUsed(t *testing.T) {
	a, one, asked := secFixture(t)
	a.Objects = checkStore{a.Objects}
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "pic", Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/pic.png", "type": "image/png", "size": 10})}, 0)
	row, _ := a.Store.Get(t.Context(), "assets", "pic")
	a.checkMedia(t.Context(), Identity{ID: "user-a", Role: "user"}, 3, "asset", "pic", assetFiles(row))
	waitFor(t, func() bool { _, e := a.Store.Get(t.Context(), "content_checks", "trace-1"); return e == nil })
	if all := strings.Join(*asked, "\n"); !strings.Contains(all, `"media_type":2`) || !strings.Contains(all, "uploads/pic.png") {
		t.Fatal(all)
	}
	push := `{"Event":"wxa_media_check","trace_id":"trace-1","version":2,"errcode":0,"result":{"suggest":"risky","label":20002}}`
	if err := a.mediaChecked(t.Context(), push); err != nil {
		t.Fatal(err)
	}
	if inputs := a.generationInputs(t.Context(), []string{"pic"}); inputs[0].Blocked != "色情" {
		t.Fatal("the admin cannot see the risky input", inputs)
	}
	in := core.JobInput{Kind: "image", Model: "demo-image", Prompt: "换个背景", Resolution: "1K", Ratio: "1:1", Assets: []string{"pic"}}
	if w := call(a, "POST", "/api/jobs", one, "pic-key-1", in); w.Code != 400 || !strings.Contains(w.Body.String(), "内容安全") {
		t.Fatal(w.Code, w.Body.String())
	}
	// A repeated push changes nothing.
	if err := a.mediaChecked(t.Context(), push); err != nil {
		t.Fatal(err)
	}
}

func TestRiskyWorkIsTakenDownFromSharesAndFeatured(t *testing.T) {
	a, _, _ := secFixture(t)
	j := core.NewJob("user-a", "work-key", core.JobInput{Kind: "image", Model: "demo-image", Prompt: "猫"})
	j.Status = "succeeded"
	_, _ = a.Store.Put(t.Context(), "users", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(map[string]any{"nickname": "甲"})}, 0)
	if _, err := a.Store.CreateJob(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	if err := a.checkShareAccess(t.Context(), j); err != nil {
		t.Fatal(err)
	}
	c := contentCheck{Target: "work", TargetID: j.ID, Kind: "image", Status: "pending"}
	_, _ = a.Store.Put(t.Context(), "content_checks", core.Record{ID: "trace-w", Owner: "user-a", Data: core.Data(c)}, 0)
	xmlPush := `<xml><Event><![CDATA[wxa_media_check]]></Event><trace_id><![CDATA[trace-w]]></trace_id><result><suggest><![CDATA[risky]]></suggest><label>20001</label></result></xml>`
	if err := a.mediaChecked(t.Context(), xmlPush); err != nil {
		t.Fatal(err)
	}
	if err := a.checkShareAccess(t.Context(), j); err == nil {
		t.Fatal("a risky work is still shown")
	}
	// 作品管理 marks it, and lists it under 违规下架.
	shown := j
	a.presentJob(t.Context(), &shown)
	if !shown.Blocked || shown.BlockReason != "时政" {
		t.Fatal(shown.Blocked, shown.BlockReason)
	}
	page, err := a.Store.JobPage(t.Context(), core.JobQuery{Page: 1, Size: 20, Works: true, Deleted: "blocked"})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != j.ID {
		t.Fatal(page.Items, err)
	}
	row, _ := a.Store.Get(t.Context(), "content_checks", "trace-w")
	var kept contentCheck
	_ = json.Unmarshal(row.Data, &kept)
	if kept.Status != "done" || kept.Suggest != "risky" || kept.Label != 20001 {
		t.Fatal(kept)
	}
}

func waitFor(t *testing.T, done func() bool) {
	for range 200 {
		if done() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out")
}
