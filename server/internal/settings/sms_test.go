package settings

import (
	"doubo/server/internal/core"
	"errors"
	"testing"
)

func smsFixture() Values {
	return Values{"SMS_ACCESS_KEY_ID": "fixture-id", "SMS_ACCESS_KEY_SECRET": "fixture-secret",
		"SMS_SIGN_NAME": "测试签名", "SMS_TEMPLATE_CODE": "SMS_123"}
}

func TestSMSLegacyAndExplicitPolicy(t *testing.T) {
	for _, configured := range []bool{false, true} {
		base := Values{}
		if configured {
			base = smsFixture()
		}
		m := testManager(t, base)
		values, err := m.LoadStartup(t.Context())
		if err != nil || (values["SMS_VERIFICATION_ENABLED"] == "true") != configured {
			t.Fatal("legacy default changed", values["SMS_VERIFICATION_ENABLED"], err)
		}
	}
	m := testManager(t, smsFixture())
	if err := m.Save(t.Context(), "sms", "admin", Update{Values: Values{"SMS_VERIFICATION_ENABLED": "false"}}, true); err != nil {
		t.Fatal(err)
	}
	states, _ := m.States(t.Context(), true)
	for _, state := range states {
		if state.ID == "sms" && (!state.PendingRestart || state.Values["SMS_ACCESS_KEY_SECRET"] != "fixture-secret") {
			t.Fatal("disable lost credentials or restart notice")
		}
	}
	restarted := New(m.Store, m.KeyPath, smsFixture())
	values, err := restarted.LoadStartup(t.Context())
	if err != nil || values["SMS_VERIFICATION_ENABLED"] != "false" {
		t.Fatal("disabled policy did not survive restart", err)
	}
	if err := restarted.Save(t.Context(), "sms", "admin", Update{Version: 1, Values: Values{"SMS_VERIFICATION_ENABLED": "true"}}, true); err != nil {
		t.Fatal(err)
	}
	values, err = restarted.LoadStartup(t.Context())
	if err != nil || values["SMS_VERIFICATION_ENABLED"] != "true" {
		t.Fatal("reenable failed", err)
	}
}

func TestSMSEnableRequiresCredentialsAndValidFlag(t *testing.T) {
	for _, values := range []Values{{"SMS_VERIFICATION_ENABLED": "true"}, {"SMS_VERIFICATION_ENABLED": "yes"}} {
		m := testManager(t, nil)
		var validation *ValidationError
		err := m.Save(t.Context(), "sms", "admin", Update{Values: values}, true)
		if !errors.As(err, &validation) || validation.Field != "SMS_VERIFICATION_ENABLED" {
			t.Fatal("invalid enable accepted", err)
		}
		if _, err = m.Store.Get(t.Context(), namespace, "sms"); !errors.Is(err, core.ErrNotFound) {
			t.Fatal("failed update persisted", err)
		}
	}
}

func TestSMSOldStoredGroupInfersPolicyFromStoredCredentials(t *testing.T) {
	m := testManager(t, nil)
	key, err := m.encryptionKey(false)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := seal("sms", smsFixture(), key)
	_, err = m.Store.Put(t.Context(), namespace, core.Record{ID: "sms", Data: raw}, 0)
	if err != nil {
		t.Fatal(err)
	}
	values, err := m.LoadStartup(t.Context())
	if err != nil || values["SMS_VERIFICATION_ENABLED"] != "true" {
		t.Fatal("old database group unexpectedly disabled", err)
	}
}
