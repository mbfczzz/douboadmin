package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

// A number left on a deleted account (older data whose release was never
// recorded) must log in and register again, and a stale entry whose account
// no longer has the number must not block it. Live and disabled owners keep it.
func TestPhoneLeftOnDeletedAccountCanLogInAgain(t *testing.T) {
	cases := []struct {
		name    string
		profile map[string]any
		freed   bool
	}{
		{"deleted account", map[string]any{"phone": "19554419507", "verifiedPhone": "19554419507", "archived": true, "disabled": true}, true},
		{"account without the number", map[string]any{"phone": "13700000000"}, true},
		{"missing account", nil, true},
		{"live account", map[string]any{"phone": "19554419507", "verifiedPhone": "19554419507"}, false},
		{"disabled account", map[string]any{"phone": "19554419507", "verifiedPhone": "19554419507", "disabled": true}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			a, _ := phoneLoginFixture(t)
			if c.profile != nil {
				if _, e := a.Store.Put(t.Context(), "users", core.Record{ID: "old-user", Owner: "old-user", Data: core.Data(c.profile)}, 0); e != nil {
					t.Fatal(e)
				}
			}
			if _, e := a.Store.Put(t.Context(), "phone_owners", core.Record{ID: "19554419507", Data: core.Data(phoneOwner{"old-user"})}, 0); e != nil {
				t.Fatal(e)
			}
			w := call(a, "POST", "/api/auth/phone/login", "", "", loginChallenge(t, a, "19554419507", "app"))
			var got struct{ UserID string }
			_ = json.Unmarshal(w.Body.Bytes(), &got)
			if c.freed && (w.Code != 200 || got.UserID == "" || got.UserID == "old-user") {
				t.Fatal("number still blocked", w.Code, w.Body.String())
			}
			if !c.freed && w.Code == 200 && got.UserID != "old-user" {
				t.Fatal("a held number was taken over", w.Body.String())
			}
		})
	}
}
