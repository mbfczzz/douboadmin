package api

import (
	"doubo/server/internal/relay"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRelayBalancePermissionFailuresAndFreshReads(t *testing.T) {
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	calls, status := 0, 200
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(status)
		if status == 200 {
			_, _ = w.Write([]byte(`{"balance":0,"unit":"points"}`))
		} else {
			_, _ = w.Write([]byte(`{"error":{"message":"secret-client-key","type":"invalid_api_key"}}`))
		}
	}))
	defer s.Close()
	a.Relay = relay.New(s.URL, "secret-client-key")
	path := "/api/admin/models/balance"
	for _, tt := range []struct {
		token string
		want  int
	}{{"", 401}, {user, 403}} {
		if w := call(a, "GET", path, tt.token, "", nil); w.Code != tt.want {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if calls != 0 {
		t.Fatal("unauthorized caller queried relay")
	}
	for i := 0; i < 2; i++ {
		w := call(a, "GET", path, admin, "", nil)
		if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Body.String(), `"balance":0`) {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if calls != 2 {
		t.Fatal("balance was cached")
	}
	for _, code := range []int{401, 404, 500} {
		status = code
		w := call(a, "GET", path, admin, "", nil)
		if w.Code != 502 || strings.Contains(w.Body.String(), "secret-client-key") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	a.Relay = relay.New("", "")
	if w := call(a, "GET", path, admin, "", nil); w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
}
