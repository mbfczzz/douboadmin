package api

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLegalDocumentsArePublicAndComplete(t *testing.T) {
	a, _, _ := setup(t)
	for _, document := range []string{"terms", "privacy", "support"} {
		r := httptest.NewRequest("GET", "/api/legal/"+document, nil)
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		if w.Code != 200 || !strings.Contains(w.Body.String(), "鲁ICP备2022009868号-9X") {
			t.Fatal(document, w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/api/legal/missing", nil))
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
}
