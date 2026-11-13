package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
)

type userIdentity struct {
	UserID   string `json:"userId"`
	Provider string `json:"provider"`
	Subject  string `json:"subject"`
	AppID    string `json:"appid"`
	Phone    string `json:"phone"`
}

// A WeChat subject is an authentication credential, not a second user account.
// Existing business identities are never silently merged or re-keyed.
func (a *Server) wechatUser(ctx context.Context, subject, phone string) (id string, fresh bool, err error) {
	key := "wx-" + core.Digest(a.Config.WeChatAppID + subject)[:32]
	candidate := ""
	if phone != "" {
		candidate, err = a.phoneCandidate(ctx, phone)
		if err != nil {
			return
		}
	}
	err = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		link, e := tx.Lock("user_identities", core.Record{ID: key, Data: core.Data(userIdentity{Provider: "wechat", Subject: subject, AppID: a.Config.WeChatAppID})})
		if e != nil {
			return e
		}
		var credential userIdentity
		if e = json.Unmarshal(link.Data, &credential); e != nil {
			return e
		}
		id = credential.UserID
		if id == "" {
			id = key
		}
		row, e := tx.Get("users", id)
		fresh = errors.Is(e, core.ErrNotFound)
		if e != nil && !fresh {
			return e
		}
		profile := map[string]any{}
		if !fresh {
			if e = json.Unmarshal(row.Data, &profile); e != nil {
				return e
			}
			if profile["disabled"] == true || profile["archived"] == true {
				return core.ErrUserDisabled
			}
		}
		if phone != "" {
			preferred := id
			if candidate != "" {
				preferred = candidate
			}
			target, created, e := a.resolvePhoneUser(tx, phone, preferred, "miniprogram", preferred == id && !fresh)
			if e != nil {
				return e
			}
			if target != id && !fresh {
				// A pre-existing WeChat profile may own funds/jobs. Preserve it for review.
				return errIdentityMerge
			}
			id, fresh = target, created
		} else {
			if fresh {
				row = core.Record{ID: id, Owner: id}
				profile = map[string]any{"nickname": "微信用户", "bio": "记录每一个闪光的创意", "authProvider": "wechat"}
			}
			userSource(profile, "miniprogram")
			row.Data = core.Data(profile)
			if _, e = putUniqueUser(tx, row, row.Version); e != nil {
				return e
			}
		}
		credential.UserID = id
		link.Owner, link.Data = id, core.Data(credential)
		if _, e = tx.Put("user_identities", link, link.Version); e != nil {
			return e
		}
		// Retain the original OpenID for legacy sessions and subscription delivery.
		if _, e = tx.Get("wechat_identities", id); errors.Is(e, core.ErrNotFound) {
			_, e = tx.Put("wechat_identities", core.Record{ID: id, Owner: id, Data: core.Data(map[string]string{"openid": subject, "appid": a.Config.WeChatAppID})}, 0)
		}
		return e
	})
	return
}
