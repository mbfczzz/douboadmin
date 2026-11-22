package api

import (
	"context"
	"doubo/server/internal/hotvideo"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Third-party failures reach users only as reasons they can act on; keys,
// balances, codes and channel detail stay in the log (and, for payments,
// with administrators).
func TestThirdPartyFailuresShowUsersOnlyWhatTheyCanActOn(t *testing.T) {
	body := func(f func(*httptest.ResponseRecorder)) string {
		w := httptest.NewRecorder()
		f(w)
		return w.Body.String()
	}
	r := httptest.NewRequest("GET", "/api/hot/link", nil)
	if got := body(func(w *httptest.ResponseRecorder) {
		hotFail(w, r, errors.New("TikHub API Key 无效，请在后台检查"))
	}); !strings.Contains(got, "抖音视频暂时读取不到") || strings.Contains(got, "TikHub") {
		t.Fatal(got)
	}
	if got := body(func(w *httptest.ResponseRecorder) {
		hotFail(w, r, hotvideo.UserError("该视频是私密内容，无法读取"))
	}); !strings.Contains(got, "私密内容") {
		t.Fatal(got)
	}
	raw := errors.New("虚拟支付请求未确认，错误码 268490002")
	as := func(role string) *http.Request {
		req := httptest.NewRequest("POST", "/api/orders/x/refresh", nil)
		return req.WithContext(context.WithValue(req.Context(), identityKey, Identity{ID: "u", Role: role}))
	}
	if got := body(func(w *httptest.ResponseRecorder) { payFail(w, as("user"), raw) }); strings.Contains(got, "268490002") || !strings.Contains(got, "支付服务暂时异常") {
		t.Fatal(got)
	}
	if got := body(func(w *httptest.ResponseRecorder) { payFail(w, as("admin"), raw) }); !strings.Contains(got, "268490002") {
		t.Fatal("administrators keep the detail", got)
	}
}
