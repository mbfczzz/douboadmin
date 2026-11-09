package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/wechat"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
)

type wxTransport func(*http.Request) (*http.Response, error)

func (f wxTransport) Do(r *http.Request) (*http.Response, error) { return f(r) }
func enableWeChat(a *Server) {
	a.Config.WeChatAppID = "wx-test"
	a.Config.WeChatSecret = "private-secret"
	a.WeChat = wechat.New(a.Config.WeChatAppID, a.Config.WeChatSecret)
	a.WeChat.HTTP = wxTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"openid":"stable-user","session_key":"never-expose"}`))}, nil
	})
}
func TestWeChatLoginCreatesStableAccountAndRevocableSession(t *testing.T) {
	a, _, _ := setup(t)
	enableWeChat(a)
	var firstID string
	for i := 0; i < 2; i++ {
		w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "fresh-code"})
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "never-expose") || strings.Contains(w.Body.String(), "stable-user") || strings.Contains(w.Body.String(), "private-secret") {
			t.Fatal("WeChat private fields leaked")
		}
		var body struct {
			Token   string `json:"token"`
			UserID  string `json:"userId"`
			New     bool   `json:"isNewUser"`
			Expires int    `json:"expiresIn"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		if body.Expires != 86400 || body.New != (i == 0) {
			t.Fatal(body)
		}
		if i == 0 {
			firstID = body.UserID
		} else if body.UserID != firstID {
			t.Fatal("identity changed")
		}
		if call(a, "GET", "/api/me", body.Token, "", nil).Code != 200 {
			t.Fatal("session unusable")
		}
		if call(a, "GET", "/api/admin/users", body.Token, "", nil).Code != 403 {
			t.Fatal("user gained admin")
		}
		if call(a, "POST", "/api/auth/logout", body.Token, "", nil).Code != 200 || call(a, "GET", "/api/me", body.Token, "", nil).Code != 401 {
			t.Fatal("logout did not revoke")
		}
	}
	rows, e := a.Store.List(context.Background(), "users", "")
	if e != nil || len(rows) != 1 {
		t.Fatal("duplicate user", e, len(rows))
	}
}
func TestConcurrentWeChatLoginsDoNotDuplicateUsers(t *testing.T) {
	a, _, _ := setup(t)
	enableWeChat(a)
	var wg sync.WaitGroup
	for range 16 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "independent-code"})
			if w.Code != 200 {
				t.Error(w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	rows, e := a.Store.List(context.Background(), "users", "")
	if e != nil || len(rows) != 1 {
		t.Fatal("duplicate account", e, len(rows))
	}
}
func TestDemoLoginRequiresExplicitOptIn(t *testing.T) {
	a, _, _ := setup(t)
	body := map[string]string{"demoId": "development-test-device"}
	if call(a, "POST", "/api/auth/login", "", "", body).Code != 403 {
		t.Fatal("demo accepted by default")
	}
	a.Config.DemoLogin = true
	if call(a, "POST", "/api/auth/login", "", "", body).Code != 200 {
		t.Fatal("explicit demo disabled")
	}
	if call(a, "POST", "/api/auth/wechat", "", "", body).Code != 403 {
		t.Fatal("wechat route accepted demo")
	}
	a.Config.Production = true
	if call(a, "POST", "/api/auth/login", "", "", body).Code != 403 {
		t.Fatal("production accepted demo")
	}
	if call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "x", "demoId": "development-test-device"}).Code != 400 {
		t.Fatal("ambiguous identity accepted")
	}
}
func TestWeChatErrorsDoNotCreateUser(t *testing.T) {
	a, _, _ := setup(t)
	enableWeChat(a)
	a.WeChat.HTTP = wxTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"errcode":40029}`))}, nil
	})
	if call(a, "POST", "/api/auth/wechat", "", "", map[string]string{"code": "expired"}).Code != 401 {
		t.Fatal("bad code accepted")
	}
	rows, _ := a.Store.List(context.Background(), "users", "")
	if len(rows) != 0 {
		t.Fatal("user created on failed login")
	}
}
func TestProfileAvatarOwnershipAndIdentityPreservation(t *testing.T) {
	a, token, _ := setup(t)
	ctx := context.Background()
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(map[string]string{"nickname": "旧昵称", "authProvider": "wechat"})}, 0)
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "own", Owner: "user-a", Data: core.Data(map[string]any{"type": "image/jpeg", "size": 100, "url": "/media/uploads/avatar.jpg"})}, 0)
	_, _ = a.Store.Put(ctx, "assets", core.Record{ID: "foreign", Owner: "user-b", Data: core.Data(map[string]string{"type": "image/jpeg"})}, 0)
	body := map[string]any{"version": 1, "nickname": "新昵称", "bio": "简介", "avatarId": "foreign"}
	if call(a, "PUT", "/api/me", token, "", body).Code != 400 {
		t.Fatal("foreign avatar accepted")
	}
	body["avatarId"] = "own"
	if w := call(a, "PUT", "/api/me", token, "", body); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	row, _ := a.Store.Get(ctx, "users", "user-a")
	if !strings.Contains(string(row.Data), `"authProvider":"wechat"`) {
		t.Fatal("login provenance dropped")
	}
	w := call(a, "GET", "/api/me", token, "", nil)
	if !strings.Contains(w.Body.String(), `"avatarUrl":"/media/uploads/avatar.jpg"`) {
		t.Fatal("avatar not returned")
	}
	if call(a, "PUT", "/api/me", token, "", body).Code != 409 {
		t.Fatal("stale profile accepted")
	}
}
func TestDisabledUserGetsNoNewSession(t *testing.T) {
	a, _, _ := setup(t)
	a.Config.DemoLogin = true
	body := map[string]string{"demoId": "disabled-test-device"}
	if call(a, "POST", "/api/auth/login", "", "", body).Code != 200 {
		t.Fatal("first login failed")
	}
	id := "demo-" + core.Digest(body["demoId"])[:24]
	row, _ := a.Store.Get(context.Background(), "users", id)
	row.Data = core.Data(map[string]any{"nickname": "x", "disabled": true})
	if _, e := a.Store.Put(context.Background(), "users", row, row.Version); e != nil {
		t.Fatal(e)
	}
	if w := call(a, "POST", "/api/auth/login", "", "", body); w.Code != 403 || !strings.Contains(w.Body.String(), "账号已停用") {
		t.Fatal("disabled user signed in", w.Code, w.Body.String())
	}
}
