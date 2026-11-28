package api

import (
	"bytes"
	"doubo/server/internal/core"
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// 内容安全's results come to the message push address virtual payments use.
func TestMediaCheckResultArrivesByMessagePush(t *testing.T) {
	a, _, _ := virtualFixture(t)
	_, _ = a.Store.Put(t.Context(), "assets", core.Record{ID: "clip", Owner: "user-a", Data: core.Data(map[string]any{"key": "uploads/a.mp3", "type": "audio/mpeg"})}, 0)
	c := contentCheck{Target: "asset", TargetID: "clip", Kind: "audio", Status: "pending"}
	_, _ = a.Store.Put(t.Context(), "content_checks", core.Record{ID: "trace-push", Owner: "user-a", Data: core.Data(c)}, 0)
	body := core.Data(map[string]any{"MsgType": "event", "Event": "wxa_media_check", "appid": "wx-fixture", "trace_id": "trace-push", "version": 2,
		"errcode": 0, "result": map[string]any{"suggest": "risky", "label": 20003}})
	raw, e := a.Virtual.Client.Reply(body, false)
	if e != nil {
		t.Fatal(e)
	}
	var env map[string]string
	_ = json.Unmarshal(raw, &env)
	q := url.Values{"msg_signature": {env["MsgSignature"]}, "timestamp": {env["TimeStamp"]}, "nonce": {env["Nonce"]}}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, httptest.NewRequest("POST", "/api/payments/virtual/notify?"+q.Encode(), bytes.NewReader(raw)))
	if w.Code != 200 || w.Body.String() != "success" {
		t.Fatal(w.Code, w.Body.String())
	}
	row, _ := a.Store.Get(t.Context(), "assets", "clip")
	if !strings.Contains(string(row.Data), `"secCheck":"risky"`) {
		t.Fatal(string(row.Data))
	}
}

// A work set as 优秀作品 is judged with its author's openid; a risky one
// leaves 优秀作品 again.
func TestFeaturedWorkIsJudgedAndTakenDownWhenRisky(t *testing.T) {
	a, _, admin, jobs := featuredFixture(t)
	fixture, _, _ := secFixture(t)
	a.Config.WeChatAppID, a.Config.WeChatSecret, a.WeChat = fixture.Config.WeChatAppID, fixture.Config.WeChatSecret, fixture.WeChat
	a.Objects = checkStore{a.Objects}
	_, _ = a.Store.Put(t.Context(), "wechat_identities", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(map[string]string{"openid": "openid-a"})}, 0)
	work := jobs[0]
	if w := call(a, "PUT", "/api/admin/works/"+work.ID+"/featured", admin, "", map[string]any{"featured": true, "version": 0}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	waitFor(t, func() bool { _, e := a.Store.Get(t.Context(), "content_checks", "trace-1"); return e == nil })
	row, _ := a.Store.Get(t.Context(), "content_checks", "trace-1")
	if !strings.Contains(string(row.Data), `"targetId":"`+work.ID+`"`) || row.Owner != "user-a" {
		t.Fatal(string(row.Data), row.Owner)
	}
	if w := call(a, "GET", "/api/featured-works/"+work.ID, "", "", nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if err := a.mediaChecked(t.Context(), `{"trace_id":"trace-1","result":{"suggest":"risky","label":20002}}`); err != nil {
		t.Fatal(err)
	}
	if w := call(a, "GET", "/api/featured-works/"+work.ID, "", "", nil); w.Code != 404 {
		t.Fatal("a risky featured work is still shown", w.Code)
	}
}
