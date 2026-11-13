package wechat

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"net/http"
	"testing"
)

func TestMiniCodeUsesTrialSceneAndChecksImage(t *testing.T) {
	c := New("wx-test", "secret")
	var img bytes.Buffer
	_ = png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 8, 8)))
	calls := 0
	c.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/cgi-bin/stable_token" {
			return phoneResponse(`{"access_token":"token","expires_in":7200}`), nil
		}
		calls++
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["scene"] != "ABCD2345" || body["page"] != "pages/activate/index" || body["env_version"] != "trial" || body["check_path"] != false {
			t.Fatal(body)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(img.Bytes()))}, nil
	})
	data, err := c.MiniCode(t.Context(), "ABCD2345", "trial")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = png.Decode(bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
	if _, err = c.MiniCode(t.Context(), "invalid", "trial"); err == nil || calls != 1 {
		t.Fatal("invalid scene reached WeChat")
	}
	c.HTTP = doFunc(func(*http.Request) (*http.Response, error) {
		return phoneResponse(`{"errcode":45009,"errmsg":"private"}`), nil
	})
	if _, err = c.MiniCode(t.Context(), "ABCD2345", "trial"); err != ErrMiniCode {
		t.Fatal(err)
	}
}
