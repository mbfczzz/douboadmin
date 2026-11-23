package api

import (
	"encoding/json"
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
	privacy, _ := json.Marshal(privacyDocument)
	for _, phrase := range []string{"收集方式、信息范围与用途", "主动勾选同意", "剪贴板", "扫码", "中华人民共和国境内", "注销账号"} {
		if !strings.Contains(string(privacy), phrase) {
			t.Fatal("privacy policy missing", phrase)
		}
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/api/legal/missing", nil))
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
}
