package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type balanceTransport func(*http.Request) (*http.Response, error)

func (f balanceTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestRelayBalanceBoundsDeadlineAndCancelsUpstream(t *testing.T) {
	a, _, _ := setup(t)
	a.Relay = relay.New("https://managed.test/managed", "private-key")
	a.Relay.HTTP.Transport = balanceTransport(func(r *http.Request) (*http.Response, error) {
		deadline, ok := r.Context().Deadline()
		if !ok || time.Until(deadline) > 8*time.Second || time.Until(deadline) < 7*time.Second {
			t.Fatal("balance request missing eight-second deadline", deadline)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"balance":0.000001,"unit":"points"}`)), Header: http.Header{}}, nil
	})
	w := httptest.NewRecorder()
	a.relayBalance(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"balance":0.000001`) {
		t.Fatal(w.Code, w.Body.String())
	}
	// The browser disconnect/deadline must reach the upstream, rather than
	// leaving a request running for the shared client's 120-second timeout.
	a.Relay.HTTP.Transport = balanceTransport(func(r *http.Request) (*http.Response, error) {
		<-r.Context().Done()
		return nil, r.Context().Err()
	})
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
	defer cancel()
	w = httptest.NewRecorder()
	a.relayBalance(w, httptest.NewRequest("GET", "/", nil).WithContext(ctx))
	if w.Code != 502 || !strings.Contains(w.Body.String(), "查询超时") {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestRelayBalanceRejectsMalformedSuccessAndNilConfig(t *testing.T) {
	a, _, _ := setup(t)
	for _, raw := range []string{`{}`, `null`, `{"balance":null,"unit":"points"}`, `{"balance":1,"unit":"yuan"}`} {
		t.Run(raw, func(t *testing.T) {
			a.Relay = relay.New("https://managed.test", "private-key")
			a.Relay.HTTP.Transport = balanceTransport(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(raw)), Header: http.Header{}}, nil
			})
			w := httptest.NewRecorder()
			a.relayBalance(w, httptest.NewRequest("GET", "/", nil))
			if w.Code != 502 || strings.Contains(w.Body.String(), `"balance":0`) || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal(w.Code, w.Body.String())
			}
		})
	}
	a.Relay = nil
	w := httptest.NewRecorder()
	a.relayBalance(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestRelayBalanceRevokesFormerSuperAdminSession(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	id, token := secondaryAdmin(t, a, admin)
	called := false
	a.Relay.HTTP.Transport = balanceTransport(func(*http.Request) (*http.Response, error) {
		called = true
		t.Fatal("revoked admin queried upstream")
		return nil, context.Canceled
	})
	row, err := a.Store.Get(t.Context(), "admin_accounts", id)
	if err != nil {
		t.Fatal(err)
	}
	var account core.AdminAccount
	if err = json.Unmarshal(row.Data, &account); err != nil {
		t.Fatal(err)
	}
	account.Role = "operator"
	row.Data = core.Data(account)
	if _, err = a.Store.Put(t.Context(), "admin_accounts", row, row.Version); err != nil {
		t.Fatal(err)
	}
	if w := call(a, "GET", "/api/admin/models/balance", token, "", nil); w.Code != 403 || called {
		t.Fatal(w.Code, w.Body.String(), called)
	}
}
