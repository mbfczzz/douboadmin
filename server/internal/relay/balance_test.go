package relay

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestManagedBalanceUsesClientKeyAndConfiguredPrefix(t *testing.T) {
	for _, value := range []string{"0", "100.123456"} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, _ := io.ReadAll(r.Body)
			if r.Method != "GET" || r.URL.Path != "/managed/v1/balance" || r.URL.RawQuery != "" || len(body) != 0 || r.Header.Get("Authorization") != "Bearer customer-key" {
				t.Error("unexpected balance request", r.Method, r.URL, string(body))
			}
			w.Header().Set("Cache-Control", "no-store")
			_, _ = w.Write([]byte(`{"balance":` + value + `,"unit":"points"}`))
		}))
		c := New(s.URL+"/managed/", "customer-key")
		balance, err := c.Balance(context.Background())
		s.Close()
		if err != nil || balance.Unit != "points" || (value == "0" && balance.Balance != 0) || (value != "0" && balance.Balance != 100.123456) {
			t.Fatal(balance, err)
		}
	}
}

func TestBalanceRejectsMissingMalformedOrWrongUnits(t *testing.T) {
	for _, body := range []string{`{}`, `{"balance":null,"unit":"points"}`, `{"balance":"12","unit":"points"}`, `{"balance":-1,"unit":"points"}`, `{"balance":1,"unit":"yuan"}`, `{"balance":1e999,"unit":"points"}`, `[]`, `not json`} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(body)) }))
		_, err := New(s.URL, "key").Balance(context.Background())
		s.Close()
		if err == nil {
			t.Fatal("invalid balance accepted", body)
		}
	}
}
