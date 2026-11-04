package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"strings"
)

func (a *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version  int64  `json:"version"`
		Nickname string `json:"nickname"`
		Name     string `json:"name"`
		Phone    string `json:"phone"`
		Bio      string `json:"bio"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Nickname, input.Name, input.Phone, input.Bio = strings.TrimSpace(input.Nickname), strings.TrimSpace(input.Name), strings.TrimSpace(input.Phone), strings.TrimSpace(input.Bio)
	if input.Nickname == "" || len([]rune(input.Nickname)) > 30 || len([]rune(input.Name)) > 50 || len([]rune(input.Bio)) > 120 || (input.Phone != "" && !validPhone.MatchString(input.Phone)) {
		fail(w, 400, "小程序用户资料无效")
		return
	}
	row, err := a.Store.Get(r.Context(), "users", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	var profile map[string]any
	if json.Unmarshal(row.Data, &profile) != nil {
		fail(w, 500, "用户资料异常")
		return
	}
	profile["nickname"], profile["name"], profile["phone"], profile["bio"] = input.Nickname, input.Name, input.Phone, input.Bio
	row.Data = core.Data(profile)
	err = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		var e error
		row, e = tx.Put("users", row, input.Version)
		if e != nil {
			return e
		}
		_, e = tx.Put("user_audit", core.Record{ID: core.NewID(), Owner: row.ID, Data: core.Data(map[string]any{"actor": identity(r).ID, "kind": "profile", "reason": "后台编辑小程序用户资料"})}, 0)
		return e
	})
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, row)
}

func (a *Server) archiveUser(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version int64  `json:"version"`
		Reason  string `json:"reason"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if len([]rune(input.Reason)) < 3 || len([]rune(input.Reason)) > 200 {
		fail(w, 400, "请填写 3–200 字的归档原因")
		return
	}
	row, err := a.Store.Get(r.Context(), "users", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	var profile map[string]any
	if json.Unmarshal(row.Data, &profile) != nil {
		fail(w, 500, "用户资料异常")
		return
	}
	profile["disabled"], profile["archived"], profile["statusReason"] = true, true, input.Reason
	row.Data = core.Data(profile)
	err = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, row.ID); e != nil {
			return e
		}
		var e error
		row, e = tx.Put("users", row, input.Version)
		if e != nil {
			return e
		}
		_, e = tx.Put("user_audit", core.Record{ID: core.NewID(), Owner: row.ID, Data: core.Data(map[string]any{"actor": identity(r).ID, "kind": "archive", "reason": input.Reason})}, 0)
		return e
	})
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, row)
}
