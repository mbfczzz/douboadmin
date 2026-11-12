package wechat

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func phoneResponse(body string) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}
}

func TestPhoneExchangeUsesServerTokenAndCachesIt(t *testing.T) {
	c := New("wx-test", "secret-fixture")
	tokens, phones := 0, 0
	c.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Fatal("invalid request body")
		}
		if r.URL.Path == "/cgi-bin/stable_token" {
			tokens++
			if body["appid"] != c.AppID || body["secret"] != c.Secret || body["force_refresh"] != false {
				t.Fatal(body)
			}
			return phoneResponse(`{"access_token":"server-private-token","expires_in":7200}`), nil
		}
		phones++
		if r.URL.Path != "/wxa/business/getuserphonenumber" || r.URL.Query().Get("access_token") != "server-private-token" || body["code"] != "phone-grant" {
			t.Fatal(r.URL.Path)
		}
		return phoneResponse(`{"errcode":0,"phone_info":{"purePhoneNumber":"13900139000","countryCode":"86","watermark":{"appid":"wx-test"}}}`), nil
	})
	for range 2 {
		phone, err := c.Phone(t.Context(), "phone-grant")
		if err != nil || phone != "13900139000" {
			t.Fatal(phone, err)
		}
	}
	if tokens != 1 || phones != 2 {
		t.Fatal(tokens, phones)
	}
}

func TestPhoneExchangeRejectsInvalidProofAndSuppressesSecrets(t *testing.T) {
	for _, body := range []string{
		`{"errcode":40029,"errmsg":"private-grant"}`,
		`{"phone_info":{"purePhoneNumber":"13900139000","countryCode":"86","watermark":{"appid":"another-app"}}}`,
		`{"phone_info":{"purePhoneNumber":"13900139000","countryCode":"82","watermark":{"appid":"wx-test"}}}`,
		`{invalid json`,
	} {
		c := New("wx-test", "secret")
		c.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
			if strings.HasSuffix(r.URL.Path, "stable_token") {
				return phoneResponse(`{"access_token":"secret-token","expires_in":7200}`), nil
			}
			return phoneResponse(body), nil
		})
		phone, err := c.Phone(t.Context(), "private-grant")
		if err == nil || phone != "" || strings.Contains(err.Error(), "private-grant") || strings.Contains(err.Error(), "secret") {
			t.Fatal(phone, err)
		}
	}
	c := New("wx-test", "secret")
	c.HTTP = doFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("URL?secret=leak") })
	if _, err := c.Phone(t.Context(), "grant"); err == nil || strings.Contains(err.Error(), "leak") {
		t.Fatal(err)
	}
}
