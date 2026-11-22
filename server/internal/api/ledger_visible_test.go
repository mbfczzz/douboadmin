package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
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

// Users never read 预留 / 冻结: an older submit entry's note (生成任务预留积分)
// reads as 提交扣除, and a failed task's note says its points will be returned.
func TestUserFacingPointsWordingHasNoReserve(t *testing.T) {
	a, user, _ := setup(t)
	_, _ = a.Store.Put(t.Context(), "wallet_ledger", core.Record{ID: "old-hold", Owner: "user-a", Data: core.Data(core.LedgerEntry{UserID: "user-a", Kind: "job_hold", AvailableDelta: -500, HeldDelta: 500, Note: "生成任务预留积分"})}, 0)
	w := call(a, "GET", "/api/wallet/ledger?page=1&size=20", user, "", nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), "预留") || !strings.Contains(w.Body.String(), "提交生成任务扣除积分") {
		t.Fatal(w.Code, w.Body.String())
	}
	if strings.Contains(heldNote, "预留") || strings.Contains(heldNote, "冻结") || strings.Contains(store.HoldNote, "预留") {
		t.Fatal("reserve wording in a user-facing note")
	}
}
