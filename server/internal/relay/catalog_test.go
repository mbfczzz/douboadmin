package relay

import (
	"context"
	"encoding/json"
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

func TestCatalogNormalizesManagedVideoModeAliases(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"aliases","modality":"video","params_schema":{"modes":["text_to_video","image_to_video","first_last_frame","multi_ref"],"resolution_by_mode":{"image_to_video":["720p"]}}}]}`))
	}))
	defer s.Close()
	rows, err := New(s.URL, "test").Catalog(context.Background())
	if err != nil || len(rows) != 1 {
		t.Fatal(rows, err)
	}
	want := []string{"t2v", "i2v", "keyframe", "omni_ref"}
	if len(rows[0].Modes) != len(want) {
		t.Fatal(rows[0].Modes)
	}
	for i := range want {
		if rows[0].Modes[i] != want[i] {
			t.Fatal(rows[0].Modes)
		}
	}
	var schema Schema
	if err = json.Unmarshal(rows[0].ParamsSchema, &schema); err != nil || len(schema.ResolutionByMode["i2v"]) != 1 {
		t.Fatal(schema, err)
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

// Seedance S10 lists only t2v + omni_ref; 全能参考 must still take images.
func TestCatalogOmniReferenceAcceptsImagesWithoutImageModes(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"seedance-2.0-S10","modality":"video","params_schema":{"modes":["t2v","omni_ref"]}},{"id":"no-image","modality":"video","params_schema":{"modes":["omni_ref"],"ref_limits":{"images":0}}}]}`))
	}))
	defer s.Close()
	rows, err := New(s.URL, "test").Catalog(context.Background())
	if err != nil || len(rows) != 2 {
		t.Fatal(rows, err)
	}
	if got := rows[0].ReferenceTypes; len(got) != 3 || got[0] != "image" {
		t.Fatal("omni_ref model lost image references:", got)
	}
	if got := rows[1].ReferenceTypes; len(got) != 2 || got[0] != "video" {
		t.Fatal("explicit zero image limit ignored:", got)
	}
}
