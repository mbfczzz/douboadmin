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
	settingsRow, _ := f.svc.Store.Get(t.Context(), "settings", "platform")
	settings := core.DefaultPlatform()
	settings.RechargeEnabled = false
	if _, err = f.svc.Store.Put(t.Context(), "settings", core.Record{ID: "platform", Data: core.Data(settings)}, settingsRow.Version); err != nil {
		t.Fatal(err)
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

func TestActiveDirectAndProviderUsersCanStillReceiveSignatures(t *testing.T) {
	for _, kind := range []string{"direct", "provider"} {
		f := newFixture(t)
		f.svc.Billing.RequireActivation = true
		_, err := f.svc.Store.Put(t.Context(), "users", core.Record{ID: "u", Owner: "u",
			Data: core.Data(map[string]string{"nickname": "test"})}, 0)
		if err != nil {
			t.Fatal(err)
		}
		if kind == "direct" {
			_, err = f.svc.Store.Put(t.Context(), "direct_access", core.Record{ID: "u", Owner: "u",
				Data: core.Data(core.DirectAccess{})}, 0)
		} else {
			_, err = f.svc.Store.Put(t.Context(), "partners", core.Record{ID: "provider",
				Data: core.Data(core.Partner{Name: "test", Status: "active", ParentID: core.RootPartner})}, 0)
			if err == nil {
				_, err = f.svc.Store.Put(t.Context(), "memberships", core.Record{ID: "u", Owner: "u",
					Data: core.Data(core.Membership{PartnerID: "provider", Status: "active"})}, 0)
			}
			f.order.Distribution = &core.DistributionSnapshot{PartnerID: "provider"}
			if err == nil {
				_, err = f.svc.Store.Put(t.Context(), "orders", core.Record{ID: f.row.ID, Owner: "u",
					Data: core.Data(f.order)}, f.row.Version)
			}
		}
		if err != nil {
			t.Fatal(err)
		}
		if err = f.svc.ClaimSignature(t.Context(), f.row.ID); err != nil {
			t.Fatal("active user was blocked by the new authorization check", kind, err)
		}
	}
}
