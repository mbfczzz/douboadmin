package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/settings"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"
)

func TestSuspensionDuringWechatExchangeCannotIssuePaymentSignature(t *testing.T) {
	a, user, _ := virtualFixture(t)
	row := virtualOrder(t, a, user)
	a.WeChat.HTTP = virtualHTTP(func(*http.Request) (*http.Response, error) {
		_, err := a.Store.Put(t.Context(), "users", core.Record{ID: "user-a", Owner: "user-a",
			Data: core.Data(map[string]any{"disabled": true})}, 0)
		if err != nil {
			t.Fatal(err)
		}
		return virtualResponse(map[string]string{"openid": "openid-a", "session_key": "private-session-key"}), nil
	})
	w := call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh-code", "platform": "android"})
	if w.Code != 403 {
		t.Fatal("suspended user received a new payment signature", w.Code)
	}
	stored, _ := a.Store.Get(t.Context(), "orders", row.ID)
	var order core.Order
	_ = json.Unmarshal(stored.Data, &order)
	if order.Virtual.Issued {
		t.Fatal("failed signature authorization consumed the order number")
	}
}

func TestPendingPaymentSettingsDuringWechatExchangePreventNewSignature(t *testing.T) {
	a, user, _ := virtualFixture(t)
	a.Integrations = settings.New(a.Store, filepath.Join(t.TempDir(), "integrations.key"), nil)
	if _, err := a.Integrations.LoadStartup(t.Context()); err != nil {
		t.Fatal(err)
	}
	row := virtualOrder(t, a, user)
	a.WeChat.HTTP = virtualHTTP(func(*http.Request) (*http.Response, error) {
		err := a.Integrations.Save(t.Context(), "wechat", "admin", settings.Update{Values: settings.Values{"WECHAT_APP_SECRET": "fixture-rotated"}}, false)
		if err != nil {
			t.Fatal(err)
		}
		return virtualResponse(map[string]string{"openid": "openid-a", "session_key": "private-session-key"}), nil
	})
	w := call(a, "POST", "/api/orders/"+row.ID+"/pay", user, "", map[string]string{"code": "fresh-code", "platform": "android"})
	if w.Code != 409 {
		t.Fatal("disabled recharge still issued a new signature", w.Code)
	}
	stored, _ := a.Store.Get(t.Context(), "orders", row.ID)
	var order core.Order
	_ = json.Unmarshal(stored.Data, &order)
	if order.Virtual.Issued {
		t.Fatal("closed recharge consumed the order number")
	}
}
