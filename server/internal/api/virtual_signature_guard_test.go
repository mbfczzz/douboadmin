package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
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

func TestClosingRechargeDuringWechatExchangePreventsNewSignature(t *testing.T) {
	a, user, _ := virtualFixture(t)
	row := virtualOrder(t, a, user)
	a.WeChat.HTTP = virtualHTTP(func(*http.Request) (*http.Response, error) {
		platform, settings, err := a.platform(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		settings.RechargeEnabled = false
		_, err = a.Store.Put(t.Context(), "settings", core.Record{ID: "platform", Data: core.Data(settings)}, platform.Version)
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
