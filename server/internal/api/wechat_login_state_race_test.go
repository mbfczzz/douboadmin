package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
	"testing"
)

// WeChat identity resolution reads through the transaction. The following
// users.Get is the final availability check immediately before session creation.
type loginStateChangeStore struct {
	store.Store
	archived bool
	changed  bool
}

func (s *loginStateChangeStore) Get(ctx context.Context, ns, id string) (core.Record, error) {
	row, err := s.Store.Get(ctx, ns, id)
	if err != nil || ns != "users" || s.changed {
		return row, err
	}
	s.changed = true
	var profile map[string]any
	if err = json.Unmarshal(row.Data, &profile); err != nil {
		return row, err
	}
	profile["disabled"] = true
	if s.archived {
		profile["archived"] = true
	}
	row.Data = core.Data(profile)
	return s.Store.Put(ctx, ns, row, row.Version)
}

func TestWeChatLoginFinalCheckReportsConcurrentAccountState(t *testing.T) {
	for _, archived := range []bool{false, true} {
		code := "ACCOUNT_DISABLED"
		if archived {
			code = "ACCOUNT_DELETED"
		}
		t.Run(code, func(t *testing.T) {
			a, _ := phoneLoginFixture(t)
			changed := &loginStateChangeStore{Store: a.Store, archived: archived}
			a.Store = changed
			response := call(a, "POST", "/api/auth/wechat", "", "", map[string]string{
				"code": "wx-code", "phoneCode": "phone-proof",
			})
			if !changed.changed {
				t.Fatal("availability race was not exercised")
			}
			var result map[string]any
			if response.Code != 403 || json.Unmarshal(response.Body.Bytes(), &result) != nil {
				t.Fatal(response.Code, response.Body.String())
			}
			if result["code"] != code || result["token"] != nil {
				t.Fatal("wrong state or session issued", response.Body.String())
			}
			want := "联系管理员"
			if archived {
				want = "重新注册"
			}
			message, _ := result["error"].(string)
			if !strings.Contains(message, want) {
				t.Fatal("wrong recovery message", message)
			}
		})
	}
}
