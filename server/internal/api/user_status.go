package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"regexp"
)

var validPhone = regexp.MustCompile(`^\+?[0-9]{7,15}$`)

func (a *Server) userStatus(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version  int64  `json:"version"`
		Disabled bool   `json:"disabled"`
		Reason   string `json:"reason"`
	}
	if !decode(w, r, &v) {
		return
	}
	if len([]rune(v.Reason)) < 3 || len([]rune(v.Reason)) > 200 {
		fail(w, 400, "请填写 3–200 字的状态变更原因")
		return
	}
	row, e := a.Store.Get(r.Context(), "users", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	var data map[string]any
	if e = json.Unmarshal(row.Data, &data); e != nil {
		dbError(w, e)
		return
	}
	data["disabled"] = v.Disabled
	data["statusReason"] = v.Reason
	row.Data = core.Data(data)
	e = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		if _, _, err := store.LockWallet(tx, row.ID); err != nil {
			return err
		}
		var err error
		row, err = tx.Put("users", row, v.Version)
		if err != nil {
			return err
		}
		_, err = tx.Put("user_audit", core.Record{ID: core.NewID(), Owner: row.ID, Data: core.Data(map[string]any{"actor": identity(r).ID, "disabled": v.Disabled, "reason": v.Reason})}, 0)
		return err
	})
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
