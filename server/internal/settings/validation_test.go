package settings

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"testing"
)

func TestInvalidSettingsNeverPersistOrAudit(t *testing.T) {
	for _, test := range []struct {
		name, group string
		values      Values
		clear       []string
	}{
		{"unknown field", "relay", Values{"MYSQL_DSN": "not-editable"}, nil},
		{"invalid address", "relay", Values{"RELAY_BASE_URL": "file:///private"}, nil},
		{"embedded credentials", "relay", Values{"RELAY_BASE_URL": "https://name:password@example.test"}, nil},
		{"invalid origin", "site", Values{"WEB_ORIGIN": "https://example.test/admin"}, nil},
		{"invalid AppID", "wechat", Values{"WECHAT_APP_ID": "wrong-app-id"}, nil},
		{"invalid flag", "virtual", Values{"WECHAT_VIRTUAL_ENABLED": "yes"}, nil},
		{"incomplete payment", "virtual", Values{"WECHAT_VIRTUAL_ENABLED": "true"}, nil},
		{"production sandbox", "virtual", Values{"WECHAT_VIRTUAL_SANDBOX_APP_KEY": "fixture"}, nil},
		{"unknown product", "virtual", Values{"WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID": "missing"}, nil},
		{"invalid mapping", "notifications", Values{"WECHAT_COMPLETION_FIELDS": `{"bad key":"value"}`}, nil},
		{"clear non-secret", "relay", nil, []string{"RELAY_BASE_URL"}},
		{"clear and replace", "relay", Values{"RELAY_API_KEY": "fixture"}, []string{"RELAY_API_KEY"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			m := testManager(t, nil)
			err := m.Save(t.Context(), test.group, "admin", Update{Values: test.values, Clear: test.clear}, true)
			var validation *ValidationError
			if !errors.As(err, &validation) {
				t.Fatal("invalid configuration accepted", err)
			}
			if _, err = m.Store.Get(t.Context(), namespace, test.group); !errors.Is(err, core.ErrNotFound) {
				t.Fatal("invalid configuration persisted", err)
			}
			audits, _ := m.Store.List(t.Context(), "integration_audit", "")
			if len(audits) != 0 {
				t.Fatal("failed transaction created an audit")
			}
		})
	}
}

func TestPaymentIdentityProtection(t *testing.T) {
	m := testManager(t, Values{"WECHAT_APP_ID": "wx0000000000000001", "WECHAT_APP_SECRET": "old-fixture"})
	update := Update{Values: Values{"WECHAT_APP_ID": "wx0000000000000002"}}
	if err := m.Save(t.Context(), "wechat", "admin", update, false); err == nil {
		t.Fatal("AppID changed while preserving mismatched AppSecret")
	}
	update.Values["WECHAT_APP_SECRET"] = "new-fixture"
	platform := core.DefaultPlatform()
	platform.RechargeEnabled = true
	row, _ := m.Store.Put(t.Context(), "settings", core.Record{ID: "platform", Data: core.Data(platform)}, 0)
	if err := m.Save(t.Context(), "wechat", "admin", update, false); err == nil {
		t.Fatal("identity changed while purchases remained open")
	}
	platform.RechargeEnabled = false
	_, _ = m.Store.Put(t.Context(), "settings", core.Record{ID: "platform", Data: core.Data(platform)}, row.Version)
	_, _ = m.Store.Put(t.Context(), "orders", core.Record{ID: "historic", Data: core.Data(core.Order{Status: "paid"})}, 0)
	if err := m.Save(t.Context(), "wechat", "admin", update, false); err == nil {
		t.Fatal("historical order identity was changed")
	}
	if err := m.Save(t.Context(), "wechat", "admin", Update{Clear: []string{"WECHAT_APP_SECRET"}}, false); err == nil {
		t.Fatal("query/refund credentials were removed")
	}
	if err := m.Save(t.Context(), "wechat", "admin", Update{Values: Values{"WECHAT_APP_SECRET": "rotated-fixture"}}, false); err != nil {
		t.Fatal("credential rotation for unchanged AppID rejected", err)
	}
	if err := m.Store.Atomic(t.Context(), func(tx store.Transaction) error {
		pending, err := m.PendingPayment(tx)
		if !pending {
			t.Error("new payment configuration not marked pending")
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}
}
