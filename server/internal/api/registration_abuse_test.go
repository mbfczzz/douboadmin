package api

import (
	"doubo/server/internal/audit"
	"doubo/server/internal/core"
	"errors"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestConcurrentWrongGuessesAreAllCounted(t *testing.T) {
	a, _, _ := activationFixture(t)
	user := newMiniUser(t, a, "user-guess")
	code := sendCode(t, a, user, "13900139010")
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "张三", "phone": "13900139010", "code": wrong})
		}()
	}
	wg.Wait()
	_, c, _ := a.smsCode(t.Context(), "user-guess")
	if c.Attempts != smsMaxAttempts {
		t.Fatal("attempts lost or exceeded", c.Attempts)
	}
	// The right code no longer helps once the attempts are used up.
	w := call(a, "POST", "/api/access/profile", user, "", map[string]string{"name": "张三", "phone": "13900139010", "code": code})
	if w.Code != 400 {
		t.Fatal("code accepted after too many attempts", w.Code)
	}
}

func TestFailedSendKeepsPreviousCodeAndPhoneHasDailyCap(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.Production, a.Config.DemoLogin = true, false
	sender := &fakeSMS{}
	a.SMS = sender
	user := newMiniUser(t, a, "user-fail")
	if w := call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "13900139011"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	first := sender.code
	a.Sessions.limits = map[string]bucket{} // reset the per-minute limits
	sender.err = errors.New("upstream down")
	if w := call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "13900139011"}); w.Code != 502 {
		t.Fatal(w.Code, w.Body.String())
	}
	_, c, _ := a.smsCode(t.Context(), "user-fail")
	if c.Digest != smsDigest("user-fail", "13900139011", first) || c.Sent != 1 {
		t.Fatal("failed send replaced the delivered code", c)
	}
	// Another account cannot keep texting a phone that reached today's cap.
	today := time.Now().In(reportZone).Format("2006-01-02")
	_, _ = a.Store.Put(t.Context(), "sms_phones", core.Record{ID: "13900139012", Data: core.Data(smsDay{Day: today, Sent: smsDailyLimit})}, 0)
	sender.err = nil
	other := newMiniUser(t, a, "user-other")
	if w := call(a, "POST", "/api/access/sms", other, "", map[string]string{"phone": "13900139012"}); w.Code != 429 {
		t.Fatal("phone daily cap ignored", w.Code, w.Body.String())
	}
}

func TestDebugCodeNeedsDemoModeAndStaysOutOfLogs(t *testing.T) {
	a, _, _ := activationFixture(t)
	a.Config.DemoLogin = false
	user := newMiniUser(t, a, "user-nodebug")
	if w := call(a, "POST", "/api/access/sms", user, "", map[string]string{"phone": "13900139013"}); w.Code != 503 {
		t.Fatal("code returned without demo mode", w.Code, w.Body.String())
	}
	if out := audit.Body([]byte(`{"debugCode":"123456"}`), false); strings.Contains(out, "123456") {
		t.Fatal("debug code logged", out)
	}
}

func TestClientIPTrustsOnlyTheProxy(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.5:4000"
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 9.9.9.9")
	if ip := clientIP(r); ip != "9.9.9.9" {
		t.Fatal("client-supplied hop trusted", ip)
	}
	r.Header.Set("X-Real-IP", "8.8.8.8")
	if ip := clientIP(r); ip != "8.8.8.8" {
		t.Fatal(ip)
	}
	r.RemoteAddr = "8.8.4.4:1"
	if ip := clientIP(r); ip != "8.8.4.4" {
		t.Fatal("public peer must not be overridden", ip)
	}
}
