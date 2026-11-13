package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"strings"
)

var errPhoneConflict = errors.New(errPhoneTaken)
var errPhoneFormat = errors.New("请输入11位手机号")
var errPhoneRequired = errors.New("手机号是必填项，不能清空")
var errPhoneUnverified = errors.New("历史账号手机号尚未验证，请先在原小程序账号完成手机号授权")
var errIdentityMerge = errors.New("该手机号与已有账号冲突，请联系超级管理员核对，原账号数据已保留")

func lockIdentity(tx store.Transaction) error {
	_, err := tx.Lock("identity_control", core.Record{ID: "accounts", Data: core.Data(map[string]any{})})
	return err
}

// The phone reservation is enforced even when registration SMS is disabled.
// Callers acquire lockIdentity before any other identity row locks.
func putUniqueUser(tx store.Transaction, row core.Record, version int64) (core.Record, error) {
	var next map[string]any
	if json.Unmarshal(row.Data, &next) != nil || next == nil {
		return row, errors.New("用户资料异常")
	}
	current, err := tx.Get("users", row.ID)
	old := map[string]any{}
	if err == nil {
		if json.Unmarshal(current.Data, &old) != nil {
			return row, errors.New("用户资料异常")
		}
	} else if !errors.Is(err, core.ErrNotFound) {
		return row, err
	}
	phone, _ := next["phone"].(string)
	phone = strings.TrimSpace(phone)
	oldPhone, _ := old["phone"].(string)
	if phone == "" && oldPhone != "" && next["archived"] != true {
		return row, errPhoneRequired
	}
	if next["archived"] != true && phone != "" {
		if !mainlandPhone.MatchString(phone) {
			return row, errPhoneFormat
		}
		ok, e := claimPhone(tx, phone, row.ID)
		if e != nil {
			return row, e
		}
		if !ok {
			return row, errPhoneConflict
		}
	}
	if phone != oldPhone || next["archived"] == true {
		if e := releasePhone(tx, oldPhone, row.ID); e != nil {
			return row, e
		}
		verified, _ := old["verifiedPhone"].(string)
		if verified != phone {
			if e := releasePhone(tx, verified, row.ID); e != nil {
				return row, e
			}
			if next["verifiedPhone"] != phone {
				delete(next, "verifiedPhone")
				delete(next, "phoneVerifiedAt")
			}
		}
	}
	if phone != oldPhone {
		if e := moveBranchPhone(tx, row.ID, oldPhone, phone); e != nil {
			return row, e
		}
		if e := syncLinkedAdminPhone(tx, row.ID, phone); e != nil {
			return row, e
		}
	}
	next["phone"] = phone
	row.Data = core.Data(next)
	row, err = tx.Put("users", row, version)
	if err != nil {
		return row, err
	}
	if phone != "" && next["verifiedPhone"] == phone && next["disabled"] != true && next["archived"] != true {
		if err = bindVerifiedBranch(tx, row.ID, phone); err != nil {
			return row, err
		}
		return tx.Get("users", row.ID)
	}
	return row, nil
}

func userSource(profile map[string]any, source string) {
	if initial, _ := profile["source"].(string); initial == "" {
		profile["source"] = source
		if profile["authProvider"] == "wechat" {
			profile["source"] = "miniprogram"
		}
	}
	seen := []string{}
	add := func(value string) {
		for _, previous := range seen {
			if previous == value {
				return
			}
		}
		if value != "" {
			seen = append(seen, value)
		}
	}
	add(profile["source"].(string))
	if raw, ok := profile["sources"].([]string); ok {
		for _, value := range raw {
			add(value)
		}
	}
	if raw, ok := profile["sources"].([]any); ok {
		for _, value := range raw {
			if text, ok := value.(string); ok {
				add(text)
			}
		}
	}
	add(source)
	profile["sources"], profile["lastLoginSource"] = seen, source
}

func inputPhone(p map[string]any) string { phone, _ := p["phone"].(string); return phone }
