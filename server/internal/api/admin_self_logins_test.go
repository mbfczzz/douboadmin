package api

import (
	"encoding/json"
	"testing"
	"time"
)

func TestOwnLoginsShowRecentAttempts(t *testing.T) {
	a, _, _ := setup(t)
	login := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "Tt661ea2"})
	if login.Code != 200 {
		t.Fatal(login.Body.String())
	}
	token := login.Result().Cookies()[0].Value
	// A wrong password for the existing account is attributed to it too.
	if w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "wrong-pass"}); w.Code != 401 {
		t.Fatal(w.Code, w.Body.String())
	}
	var me struct {
		SessionExpires time.Time `json:"sessionExpires"`
	}
	_ = json.Unmarshal(call(a, "GET", "/api/admin/me", token, "", nil).Body.Bytes(), &me)
	if !me.SessionExpires.After(time.Now()) {
		t.Fatal("session expiry missing", me)
	}
	var logins []struct {
		OK bool   `json:"ok"`
		IP string `json:"ip"`
	}
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); time.Sleep(50 * time.Millisecond) {
		_ = json.Unmarshal(call(a, "GET", "/api/admin/me/logins", token, "", nil).Body.Bytes(), &logins)
		if len(logins) == 2 {
			break
		}
	}
	if len(logins) != 2 || logins[0].OK || !logins[1].OK || logins[1].IP == "" {
		t.Fatal("recent sign-ins", logins)
	}
}

// Another account whose name contains this one's must not crowd it out.
func TestOwnLoginsIgnoreSimilarAccounts(t *testing.T) {
	a, _, _ := setup(t)
	login := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "Tt661ea2"})
	token := login.Result().Cookies()[0].Value
	for range 60 {
		a.Sessions.limits = map[string]bucket{}
		call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "xadmin", "password": "nope"})
	}
	var logins []struct{ OK bool }
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline) && len(logins) == 0; time.Sleep(50 * time.Millisecond) {
		_ = json.Unmarshal(call(a, "GET", "/api/admin/me/logins", token, "", nil).Body.Bytes(), &logins)
	}
	if len(logins) != 1 || !logins[0].OK {
		t.Fatal("own sign-in lost among similar names", logins)
	}
}
