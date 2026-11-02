package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
)

func (a *Server) saveWeChatIdentity(ctx context.Context, id, openid string) error {
	row, e := a.Store.Get(ctx, "wechat_identities", id)
	if e == nil {
		var identity struct {
			OpenID string `json:"openid"`
		}
		if json.Unmarshal(row.Data, &identity) != nil || identity.OpenID != openid {
			return fmt.Errorf("微信身份关联异常")
		}
		return nil
	}
	if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	_, e = a.Store.Put(ctx, "wechat_identities", core.Record{ID: id, Owner: id, Data: core.Data(map[string]string{"openid": openid, "appid": a.Config.WeChatAppID})}, 0)
	if errors.Is(e, core.ErrConflict) {
		return a.saveWeChatIdentity(ctx, id, openid)
	}
	return e
}
