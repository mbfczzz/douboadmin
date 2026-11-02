package relay

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCatalogDurationRangesAndStrictLists(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"range","name":"范围","modality":"video","params_schema":{"duration":["4s","8s"],"modes":["t2v","i2v","omni_ref"],"ref_limits":{"video":0,"audio":1}}},{"id":"strict","modality":"video","params_schema":{"duration":["4s","8s"],"duration_strict":true}}]}`))
	}))
	defer s.Close()
	rows, err := New(s.URL, "test").Catalog(context.Background())
	if err != nil || len(rows) != 2 {
		t.Fatal(err)
	}
	if len(rows[0].Durations) != 5 || len(rows[1].Durations) != 2 || rows[0].Name != "范围" {
		t.Fatal(rows)
	}
	if len(rows[0].ReferenceTypes) != 2 {
		t.Fatal(rows[0].ReferenceTypes)
	}
}

func TestCatalogRejectsEmptyOrInvalidPayload(t *testing.T) {
	for _, body := range []string{"[]", `{"message":"empty"}`, `[{"id":"same"},{"id":"same"}]`} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(body)) }))
		if _, e := New(s.URL, "test").Catalog(context.Background()); e == nil {
			t.Errorf("accepted %s", body)
		}
		s.Close()
	}
}

func TestRelayDoesNotForwardCredentialsToRedirect(t *testing.T) {
	hits := 0
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ }))
	defer target.Close()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer s.Close()
	if _, e := New(s.URL, "private").Catalog(context.Background()); e == nil {
		t.Fatal("redirect accepted")
	}
	if hits != 0 {
		t.Fatal("credential destination followed")
	}
}
