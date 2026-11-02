package wechat

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type doFunc func(*http.Request) (*http.Response, error)

func (f doFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }
func TestExchangeContract(t *testing.T) {
	c := New("wx-test", "private-secret")
	c.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		q := r.URL.Query()
		if r.URL.Host != "api.weixin.qq.com" || r.URL.Path != "/sns/jscode2session" || q.Get("grant_type") != "authorization_code" || q.Get("js_code") != "fresh-code" || q.Get("appid") != "wx-test" || q.Get("secret") != "private-secret" {
			t.Fatal("incorrect WeChat request")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"openid":"user-openid","session_key":"private-session-key"}`))}, nil
	})
	id, err := c.Exchange(context.Background(), "fresh-code")
	if err != nil || id != "user-openid" {
		t.Fatal(id, err)
	}
}
func TestWeChatErrorMapping(t *testing.T) {
	cases := []struct {
		name, body string
		status     int
		want       error
	}{
		{"expired", `{"errcode":40029}`, 200, ErrInvalidCode}, {"used", `{"errcode":40163}`, 200, ErrInvalidCode}, {"limited", `{"errcode":45011}`, 200, ErrRateLimited}, {"rejected", `{"errcode":40226}`, 200, ErrRejected}, {"secret", `{"errcode":40125,"errmsg":"secret details"}`, 200, ErrNotConfigured}, {"missing identity", `{"session_key":"secret"}`, 200, ErrUnavailable}, {"bad json", `not json`, 200, ErrUnavailable}, {"upstream http", `{"openid":"not-trusted"}`, 500, ErrUnavailable},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			c := New("wx-test", "private")
			c.HTTP = doFunc(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: tt.status, Body: io.NopCloser(strings.NewReader(tt.body))}, nil
			})
			id, err := c.Exchange(context.Background(), "code")
			if id != "" || !errors.Is(err, tt.want) {
				t.Fatal(id, err)
			}
		})
	}
}
func TestTransportSecretsNotExposed(t *testing.T) {
	c := New("wx-test", "private-secret")
	c.HTTP = doFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("https://api.weixin.qq.com?secret=private-secret&js_code=private-code")
	})
	_, err := c.Exchange(context.Background(), "code")
	if !errors.Is(err, ErrUnavailable) || strings.Contains(err.Error(), "private") {
		t.Fatal("transport detail leaked")
	}
	if _, err = New("", "").Exchange(context.Background(), "code"); !errors.Is(err, ErrNotConfigured) {
		t.Fatal(err)
	}
}
