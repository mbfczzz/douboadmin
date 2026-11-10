package virtualpay

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"testing"
)

func TestSignatureRefusesMissingOrDisabledMembership(t *testing.T) {
	for _, state := range []string{"missing", "disabled", "active-new-owner"} {
		f := newFixture(t)
		f.svc.Billing.RequireActivation = true
		_, err := f.svc.Store.Put(t.Context(), "users", core.Record{ID: "u", Owner: "u",
			Data: core.Data(map[string]string{"nickname": "test"})}, 0)
		if err != nil {
			t.Fatal(err)
		}
		if state != "missing" {
			status := "disabled"
			if state == "active-new-owner" {
				status = "active"
			}
			_, err = f.svc.Store.Put(t.Context(), "memberships", core.Record{ID: "u", Owner: "u",
				Data: core.Data(core.Membership{Status: status, PartnerID: core.RootPartner})}, 0)
			if err != nil {
				t.Fatal(err)
			}
		}
		if err = f.svc.ClaimSignature(t.Context(), f.row.ID); err == nil {
			t.Fatal("invalid/reassigned access issued a signature", state)
		}
		row, _ := f.svc.Store.Get(t.Context(), "orders", f.row.ID)
		var order core.Order
		_ = json.Unmarshal(row.Data, &order)
		if order.Virtual.Issued {
			t.Fatal("failed authorization consumed the order", state)
		}
	}
}

func TestSignedPaymentStillCreditsAfterAccountSuspension(t *testing.T) {
	f := newFixture(t)
	if err := f.svc.ClaimSignature(t.Context(), f.row.ID); err != nil {
		t.Fatal(err)
	}
	_, err := f.svc.Store.Put(t.Context(), "users", core.Record{ID: "u", Owner: "u",
		Data: core.Data(map[string]bool{"disabled": true})}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.svc.ClaimSignature(t.Context(), f.row.ID); !errors.Is(err, core.ErrUserDisabled) {
		t.Fatal("suspended account could request another signature", err)
	}
	for range 2 {
		if err = f.svc.Refresh(t.Context(), f.row.ID); err != nil {
			t.Fatal("previously authorized money was lost", err)
		}
	}
	wallet, _ := f.svc.Billing.Wallet(t.Context(), "u")
	entries, _ := f.svc.Store.List(t.Context(), "wallet_ledger", "u")
	if wallet.Available != 10000 || len(entries) != 1 {
		t.Fatal("settlement after suspension lost or doubled credit", wallet, len(entries))
	}
}

// put stores one record in the fixture's store.
func (f *fixture) put(t *testing.T, ns, id string, v any, version int64) {
	t.Helper()
	if _, err := f.svc.Store.Put(t.Context(), ns, core.Record{ID: id, Owner: "u", Data: core.Data(v)}, version); err != nil {
		t.Fatal(err)
	}
}

func TestActiveMembersReceiveSignaturesAndPendingOwnersDoNot(t *testing.T) {
	for _, kind := range []string{"pending-owner", "member"} {
		f := newFixture(t)
		f.svc.Billing.RequireActivation = true
		f.put(t, "users", "u", map[string]string{"nickname": "test"}, 0)
		f.put(t, "partners", "provider", core.Partner{Name: "test", Status: "active", ParentID: core.RootPartner}, 0)
		switch kind {
		case "member":
			f.put(t, "memberships", "u", core.Membership{PartnerID: "provider", Status: "active"}, 0)
			f.order.Distribution = &core.DistributionSnapshot{PartnerID: "provider"}
			f.put(t, "orders", f.row.ID, f.order, f.row.Version)
		default:
			f.put(t, "partner_owners", "u", core.PartnerOwner{PartnerID: "provider", Status: "pending"}, 0)
		}
		err := f.svc.ClaimSignature(t.Context(), f.row.ID)
		if kind == "pending-owner" {
			if !errors.Is(err, core.ErrActivationRequired) {
				t.Fatal("a pending owner received a signature", err)
			}
		} else if err != nil {
			t.Fatal("active user was blocked by the new authorization check", kind, err)
		}
	}
}

// An approved provider owner's order has no commission snapshot and still
// gets its payment signature.
func TestSignatureAllowsAnApprovedProviderOwner(t *testing.T) {
	f := newFixture(t)
	f.svc.Billing.RequireActivation = true
	f.put(t, "users", "u", map[string]string{"nickname": "test"}, 0)
	f.put(t, "partners", "p1", core.Partner{Name: "华东", Role: core.RoleBranch, ParentID: core.RootPartner, Status: "active"}, 0)
	f.put(t, "partner_owners", "u", core.PartnerOwner{PartnerID: "p1", Status: "active"}, 0)
	if err := f.svc.ClaimSignature(t.Context(), f.row.ID); err != nil {
		t.Fatal("owner refused a signature", err)
	}
}
