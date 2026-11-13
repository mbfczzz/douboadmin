package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"testing"
)

type deletionFaultStore struct {
	store.Store
	before func()
	fail   bool
}
type deletionFaultTx struct{ store.Transaction }

func (t deletionFaultTx) Put(ns string, row core.Record, v int64) (core.Record, error) {
	if ns == "partner_audit" {
		return row, errors.New("injected audit write failure")
	}
	return t.Transaction.Put(ns, row, v)
}
func (s deletionFaultStore) Atomic(ctx context.Context, fn func(store.Transaction) error) error {
	if s.before != nil {
		s.before()
	}
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if s.fail {
			return fn(deletionFaultTx{tx})
		}
		return fn(tx)
	})
}

func TestDeleteRechecksSuperAdminAndRollsBackLateFailure(t *testing.T) {
	for _, scenario := range []string{"revoke", "failure"} {
		t.Run(scenario, func(t *testing.T) {
			a, _, super := activationFixture(t)
			branch := createBranch(t, a, super, "delete-review")
			code, e := a.Partners.Share(t.Context(), branch, "", "admin")
			if e != nil {
				t.Fatal(e)
			}
			preview := deletionPreview(t, a, super, branch)
			before, _ := a.Store.Get(t.Context(), "partners", branch)
			wrapped := deletionFaultStore{Store: a.Store, fail: scenario == "failure"}
			if scenario == "revoke" {
				wrapped.before = func() {
					row, account, e := recordOf[core.AdminAccount](t.Context(), a.Store, "admin_accounts", adminID("admin"))
					if e != nil {
						t.Fatal(e)
					}
					account.Role = "operator"
					row.Data = core.Data(account)
					if _, e = a.Store.Put(t.Context(), "admin_accounts", row, row.Version); e != nil {
						t.Fatal(e)
					}
				}
			}
			a.Partners.Store = wrapped
			w := call(a, "DELETE", "/api/admin/partners/"+branch, super, "", map[string]string{"confirm": "delete-users", "token": preview.Token, "reason": "确认删除测试"})
			want := 503
			if scenario == "revoke" {
				want = 403
			}
			if w.Code != want {
				t.Fatal(w.Code, w.Body.String())
			}
			after, _ := a.Store.Get(t.Context(), "partners", branch)
			_, share, _ := recordOf[core.ShareCode](t.Context(), a.Store, "share_codes", code.Code)
			if after.Version != before.Version || share.Status != "active" {
				t.Fatal("partial deletion")
			}
		})
	}
}

func TestDeleteClosesPendingRegistrationsAndRetiresMemberPromo(t *testing.T) {
	a, _, super := activationFixture(t)
	branch := createBranch(t, a, super, "old-provider")
	_ = createBranch(t, a, super, "new-provider")
	a.Store.Put(t.Context(), "memberships", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(core.Membership{PartnerID: branch, Status: "active"})}, 0)
	oldPromo, e := a.Partners.PromoCode(t.Context(), "user-a")
	if e != nil {
		t.Fatal(e)
	}
	newMiniUser(t, a, "pending-delete-user")
	pendingProfile, _ := a.Store.Get(t.Context(), "users", "pending-delete-user")
	pendingProfile.Data = core.Data(map[string]string{"name": "待审核用户", "phone": "13912345678", "verifiedPhone": "13912345678"})
	a.Store.Put(t.Context(), "users", pendingProfile, pendingProfile.Version)
	code, e := a.Partners.Share(t.Context(), branch, "s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = a.Partners.Join(t.Context(), "pending-delete-user", code.Code, "scan"); e != nil {
		t.Fatal(e)
	}
	pending, reg, e := recordOf[core.Registration](t.Context(), a.Store, "registrations", "pending-delete-user")
	if e != nil {
		t.Fatal(e)
	}
	preview := deletionPreview(t, a, super, branch)
	w := call(a, "DELETE", "/api/admin/partners/"+branch, super, "", map[string]string{"confirm": "delete-users", "token": preview.Token, "reason": "关闭旧分公司"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	_, reg, _ = recordOf[core.Registration](t.Context(), a.Store, "registrations", "pending-delete-user")
	_, use, _ := recordOf[core.CodeUse](t.Context(), a.Store, "code_uses", core.CodeUseID(pending.ID, code.Code))
	if reg.Status != "rejected" || use.Status != "rejected" {
		t.Fatal("pending review left behind")
	}
	if _, e = a.Partners.Decide(t.Context(), pending.ID, true, "", pending.Version, adminID("admin")); e == nil {
		t.Fatal("stale approval restored deleted child")
	}
	_, profile, _ := recordOf[map[string]any](t.Context(), a.Store, "users", "user-a")
	if profile["archived"] != true {
		t.Fatal("member not deleted")
	}
	_, share, _ := recordOf[core.ShareCode](t.Context(), a.Store, "share_codes", oldPromo)
	if share.Status == "active" {
		t.Fatal("deleted member promo still active")
	}
}
