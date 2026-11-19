package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

// Users see points taken at submit and returned on failure; settling a
// charge that was already taken is not a change they can see. Admins see all.
func TestUserLedgerListsOnlyAvailableChanges(t *testing.T) {
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	for id, entry := range map[string]core.LedgerEntry{
		"hold":    {Kind: "job_hold", AvailableDelta: -500, HeldDelta: 500},
		"charge":  {Kind: "job_charge", HeldDelta: -500},
		"release": {Kind: "job_release", AvailableDelta: 300, HeldDelta: -300},
	} {
		entry.UserID = "user-a"
		if _, e := a.Store.Put(t.Context(), "wallet_ledger", core.Record{ID: id, Owner: "user-a", Data: core.Data(entry)}, 0); e != nil {
			t.Fatal(e)
		}
	}
	kinds := func(path, token string) map[string]bool {
		t.Helper()
		w := call(a, "GET", path+"?page=1&size=20", token, "", nil)
		var page core.RecordPage
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		out := map[string]bool{}
		for _, row := range page.Items {
			out[row.ID] = true
		}
		return out
	}
	if got := kinds("/api/wallet/ledger", user); !got["hold"] || !got["release"] || got["charge"] || len(got) != 2 {
		t.Fatal("user ledger", got)
	}
	if got := kinds("/api/admin/users/user-a/ledger", admin); len(got) != 3 {
		t.Fatal("admin ledger must stay complete", got)
	}
}
