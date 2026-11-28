package wechat

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type secHTTP func(*http.Request) (*http.Response, error)

func (f secHTTP) Do(r *http.Request) (*http.Response, error) { return f(r) }

func reply(body string) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}
}

func TestMsgSecCheckReadsTheVerdictWithAFreshTokenWhenTheOldOneExpired(t *testing.T) {
	c, tokens, checks := New("wx-app", "secret"), 0, 0
	c.HTTP = secHTTP(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cgi-bin/stable_token" {
			tokens++
			return reply(`{"access_token":"t` + string(rune('0'+tokens)) + `","expires_in":7200}`), nil
		}
		checks++
		raw, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(raw), `"openid":"o-1"`) || !strings.Contains(string(raw), `"scene":3`) || !strings.Contains(string(raw), `"version":2`) {
			t.Errorf("body %s", raw)
		}
		if r.URL.Query().Get("access_token") == "t1" {
			return reply(`{"errcode":40001,"errmsg":"invalid credential"}`), nil
		}
		return reply(`{"errcode":0,"errmsg":"ok","result":{"suggest":"risky","label":20001}}`), nil
	})
	v, call, err := c.MsgSecCheck(t.Context(), "o-1", SceneForum, "文本")
	if err != nil || v.Suggest != "risky" || v.Label != 20001 || tokens != 2 || checks != 2 {
		t.Fatal(v, err, tokens, checks)
	}
	if call.Path != "/wxa/msg_sec_check" || strings.Contains(string(call.Response), "t2") {
		t.Fatal(call)
	}
}

func TestMediaCheckAsyncGivesTheTraceAndHidesTheTokenOnFailure(t *testing.T) {
	c := New("wx-app", "secret")
	c.HTTP = secHTTP(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cgi-bin/stable_token" {
			return reply(`{"access_token":"secret-token","expires_in":7200}`), nil
		}
		raw, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(raw), `"media_type":2`) || !strings.Contains(string(raw), `"media_url":"https://oss.test/a.jpg"`) {
			t.Errorf("body %s", raw)
		}
		return reply(`{"errcode":0,"errmsg":"ok","trace_id":"trace-9"}`), nil
	})
	trace, _, err := c.MediaCheckAsync(t.Context(), "o-1", SceneForum, MediaImage, "https://oss.test/a.jpg")
	if err != nil || trace != "trace-9" {
		t.Fatal(trace, err)
	}
	c.HTTP = secHTTP(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cgi-bin/stable_token" {
			return reply(`{"access_token":"secret-token","expires_in":7200}`), nil
		}
		return nil, errors.New("dial " + r.URL.String())
	})
	if _, _, err = c.MediaCheckAsync(t.Context(), "o-1", SceneForum, MediaImage, "https://oss.test/a.jpg"); err == nil || strings.Contains(err.Error(), "secret-token") {
		t.Fatal(err)
	}
	if _, _, err = New("", "").MsgSecCheck(t.Context(), "o", 1, "x"); !errors.Is(err, ErrNotConfigured) {
		t.Fatal(err)
	}
}
