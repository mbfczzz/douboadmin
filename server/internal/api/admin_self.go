package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// changeOwnPassword lets any admin or provider account change its own
// password. Other sessions end (their password version no longer matches);
// the caller gets a fresh session so it stays signed in.
func (a *Server) changeOwnPassword(w http.ResponseWriter, r *http.Request) {
	if !a.loginLimit(w, r) {
		return
	}
	var v struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if !decode(w, r, &v) {
		return
	}
	row, err := a.Store.Get(r.Context(), "admin_accounts", identity(r).ID)
	if err != nil {
		dbError(w, err)
		return
	}
	var account core.AdminAccount
	if json.Unmarshal(row.Data, &account) != nil {
		fail(w, 500, "管理账号数据异常")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(v.Current)) != nil {
		fail(w, 400, "当前密码不正确")
		return
	}
	if v.Current == v.Next {
		fail(w, 400, "新密码不能与当前密码相同")
		return
	}
	hash, err := hashPassword(v.Next)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	account.PasswordHash, account.PasswordChangedAt = hash, time.Now().UTC()
	row.Data = core.Data(account)
	if row, err = a.Store.Put(r.Context(), "admin_accounts", row, row.Version); err != nil {
		dbError(w, err)
		return
	}
	token, err := a.Sessions.CreateAdmin(r.Context(), row.ID, account.Username, account.Role, account.PasswordChangedAt)
	if err != nil {
		dbError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "doubo_session", Value: token, Path: "/api", HttpOnly: true, Secure: a.Config.Production, SameSite: http.SameSiteStrictMode, MaxAge: 86400})
	reply(w, 200, map[string]bool{"ok": true})
}
