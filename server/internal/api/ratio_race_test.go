package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"testing"
)

type beforeRatioWrite struct {
	store.Store
	before func()
}

func (s *beforeRatioWrite) Atomic(ctx context.Context, fn func(store.Transaction) error) error {
	if f := s.before; f != nil {
		s.before = nil
		f()
	}
	return s.Store.Atomic(ctx, fn)
}

func TestRatioRechecksAuthorityAndLimitsAtCommit(t *testing.T) {
	for _, change := range []string{"lower-limit", "disable-account"} {
		t.Run(change, func(t *testing.T) {
			a, _, super := activationFixture(t)
			parent := createProvider(t, a, super, "race-parent", "root", "上级", "branch", map[string]string{"username": "race-parent", "password": "Parent12"})
			child := createProvider(t, a, super, "race-child", parent, "下级", "s1", nil)
			pv, pd := providerData(t, a, super, parent)
			pd["childMarginBps"] = 3000
			if w := call(a, "PUT", "/api/admin/partners/"+parent, super, "", map[string]any{"version": pv, "data": pd}); w.Code != 200 {
				t.Fatal(w.Body.String())
			}
			cv, cd := providerData(t, a, super, child)
			cd["childMarginBps"] = 1000
			if w := call(a, "PUT", "/api/admin/partners/"+child, super, "", map[string]any{"version": cv, "data": cd}); w.Code != 200 {
				t.Fatal(w.Body.String())
			}
			token := adminLoginToken(t, a, "race-parent", "Parent12")
			cv, cd = providerData(t, a, token, child)
			cd["childMarginBps"] = 2500
			base := a.Store
			changed := false
			a.Partners.Store = &beforeRatioWrite{Store: base, before: func() {
				changed = true
				if change == "lower-limit" {
					row, e := base.Get(t.Context(), "partners", parent)
					if e != nil {
						t.Fatal(e)
					}
					var current core.Partner
					_ = json.Unmarshal(row.Data, &current)
					current.ChildMarginBps = 1500
					service := partners.Service{Store: base}
					if _, e = service.Update(t.Context(), parent, current, row.Version, adminID("admin")); e != nil {
						t.Fatal(e)
					}
				} else {
					row, e := base.Get(t.Context(), "admin_accounts", adminID("race-parent"))
					if e != nil {
						t.Fatal(e)
					}
					var current core.AdminAccount
					_ = json.Unmarshal(row.Data, &current)
					current.Disabled = true
					row.Data = core.Data(current)
					if _, e = base.Put(t.Context(), "admin_accounts", row, row.Version); e != nil {
						t.Fatal(e)
					}
				}
			}}
			response := call(a, "PUT", "/api/admin/partners/"+child, token, "", map[string]any{"version": cv, "data": cd})
			want := 400
			if change == "disable-account" {
				want = 403
			}
			if !changed || response.Code != want {
				t.Fatal("stale preflight authorization accepted", response.Code, response.Body.String())
			}
			row, e := base.Get(t.Context(), "partners", child)
			if e != nil {
				t.Fatal(e)
			}
			var current core.Partner
			_ = json.Unmarshal(row.Data, &current)
			if current.ChildMarginBps != 1000 || row.Version != cv {
				t.Fatal("denied write changed child")
			}
		})
	}
}
