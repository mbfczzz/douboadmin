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
	if problem := userProfileProblem(input.Nickname, input.Name, input.Phone, input.Bio); problem != "" {
		fail(w, 400, problem)
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
	// A changed phone must be verified again by SMS, which needs a mainland
	// number; clearing name or phone would send the user back to registration.
	oldName, _ := profile["name"].(string)
	oldPhone, _ := profile["phone"].(string)
	switch {
	case input.Phone != oldPhone && input.Phone != "" && !mainlandPhone.MatchString(input.Phone):
		fail(w, 400, "请填写 11 位手机号（短信验证仅支持中国大陆号码）")
		return
	case a.registrationRequired() && (oldName != "" && input.Name == "" || oldPhone != "" && input.Phone == ""):
		fail(w, 400, "姓名和手机号是用户使用的必填资料，不能清空")
		return
	}
	if input.Phone != oldPhone && input.Phone != "" {
		if taken, e := a.phoneTaken(r.Context(), input.Phone, row.ID); e != nil {
			dbError(w, e)
			return
		} else if taken {
			fail(w, 400, errPhoneTaken)
			return
		}
	}
	profile["nickname"], profile["name"], profile["phone"], profile["bio"] = input.Nickname, input.Name, input.Phone, input.Bio
	row.Data = core.Data(profile)
	err = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		var e error
		row, e = putUniqueUser(tx, row, input.Version)
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
		fail(w, 400, "请填写 3–200 字的删除原因")
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
		if e := lockIdentity(tx); e != nil {
			return e
		}
		if e := releasePhone(tx, inputPhone(profile), row.ID); e != nil {
			return e
		}
		if _, _, e := store.LockWallet(tx, row.ID); e != nil {
			return e
		}
		var e error
		row, e = putUniqueUser(tx, row, input.Version)
		if e != nil {
			return e
		}
		// An archived (deregistered) account frees its phone for a new account.
		if phone, _ := profile["verifiedPhone"].(string); phone != "" {
			if e = releasePhone(tx, phone, row.ID); e != nil {
				return e
			}
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

// userProfileProblem names the first invalid field instead of a generic error.
func userProfileProblem(nickname, name, phone, bio string) string {
	switch {
	case nickname == "" || len([]rune(nickname)) > 30:
		return "昵称需为 1–30 字"
	case len([]rune(name)) > 50:
		return "姓名不能超过 50 字"
	case phone != "" && !validPhone.MatchString(phone):
		return "手机号格式不正确"
	case len([]rune(bio)) > 120:
		return "简介不能超过 120 字"
	}
	return ""
}
