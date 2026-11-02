package api

import (
	"context"
	"doubo/server/internal/core"
	"testing"
)

func TestAdminCanInspectDisabledUserWallet(t *testing.T) {
	a, user, admin := activationFixture(t)
	ctx := context.Background()
	row, e := a.Store.Get(ctx, "users", "user-a")
	if e != nil {
		t.Fatal(e)
	}
	row.Data = core.Data(map[string]any{"disabled": true})
	if _, e = a.Store.Put(ctx, "users", row, row.Version); e != nil {
		t.Fatal(e)
	}
	if w := call(a, "GET", "/api/admin/users/user-a/wallet", admin, "", nil); w.Code != 200 {
		t.Fatalf("admin lost read access: %d %s", w.Code, w.Body.String())
	}
	if w := call(a, "GET", "/api/wallet", user, "", nil); w.Code != 403 {
		t.Fatalf("disabled user gained access: %d", w.Code)
	}
}
