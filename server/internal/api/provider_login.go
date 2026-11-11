package api

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"doubo/server/internal/core"
)

const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

func randomPassword() string {
	b := make([]byte, 20)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = passwordAlphabet[int(b[i])%len(passwordAlphabet)]
	}
	return string(b)
}

// providerPassword opens the sub-provider's admin login (the verified phone
// is the account) or resets its password.
func (a *Server) providerPassword(w http.ResponseWriter, r *http.Request) {
	id, p, owner, ok := a.managedPartner(w, r)
	if !ok {
		return
	}
	// A provider created in the admin keeps the login its parent manages.
	if !owner {
		fail(w, 403, "请在管理后台修改登录密码")
		return
	}
	if allowed, e := a.Sessions.Allow(r.Context(), "provider-password:"+identity(r).ID, 5); e != nil || !allowed {
		fail(w, 429, "操作过于频繁，请稍后再试")
		return
	}
	password := randomPassword()
	hash, e := hashPassword(password)
	if e != nil {
		dbError(w, e)
		return
	}
	row, account, found, e := a.providerAccount(r.Context(), id)
	if e != nil {
		dbError(w, e)
		return
	}
	if found {
		account.PasswordHash, account.PasswordChangedAt = hash, time.Now().UTC()
		row.Data = core.Data(account)
		if _, e = a.Store.Put(r.Context(), "admin_accounts", row, row.Version); e != nil {
			dbError(w, e)
			return
		}
		a.savePassword(r, id, password, account.PasswordChangedAt)
		reply(w, 200, map[string]string{"account": account.Username, "password": password})
		return
	}
	user, e := a.Store.Get(r.Context(), "users", identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	var profile struct {
		Phone string `json:"phone"`
	}
	_ = json.Unmarshal(user.Data, &profile)
	if !adminUsername.MatchString(profile.Phone) {
		fail(w, 400, "请先完成手机号验证")
		return
	}
	in := providerAccountInput{Username: profile.Phone, Role: p.Role}
	created, e := a.createProviderAccount(r.Context(), id, p.Name, hash, in, "user:"+identity(r).ID)
	if errors.Is(e, core.ErrConflict) {
		fail(w, 409, "该手机号已被其他后台账号使用，请联系上级服务商开通登录")
		return
	} else if e != nil {
		dbError(w, e)
		return
	}
	var saved core.AdminAccount
	_ = json.Unmarshal(created.Data, &saved)
	a.savePassword(r, id, password, saved.PasswordChangedAt)
	reply(w, 200, map[string]string{"account": profile.Phone, "password": password})
}
