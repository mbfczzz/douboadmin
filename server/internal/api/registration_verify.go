package api

import (
	"context"
	"crypto/subtle"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Registration always collects a name. Phone verification is required only
// when SMS is configured; name-only registration never changes phone fields.
func (a *Server) register(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if !decode(w, r, &v) {
		return
	}
	user, name, phone := identity(r).ID, strings.TrimSpace(v.Name), strings.TrimSpace(v.Phone)
	phoneRequired := a.registrationRequired()
	switch {
	case name == "" || len([]rune(name)) > 30:
		fail(w, 400, "请填写姓名（30 字以内）")
		return
	case !phoneRequired && (phone != "" || v.Code != ""):
		fail(w, 400, "短信验证尚未启用，请仅填写姓名")
		return
	case phoneRequired && !mainlandPhone.MatchString(phone):
		fail(w, 400, "请输入 11 位手机号")
		return
	case phoneRequired && !smsDigits.MatchString(v.Code):
		fail(w, 400, "请输入 6 位验证码")
		return
	}
	if !a.allowAll(w, r, "验证过于频繁，请稍后再试", limit{"sms-verify:" + user, 10}) {
		return
	}
	var problem string
	var e error
	if phoneRequired {
		problem, e = a.verifyAndRegister(r.Context(), user, name, phone, v.Code)
	} else {
		e = a.registerName(r.Context(), user, name)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if problem != "" {
		fail(w, 400, problem)
		return
	}
	out, e := a.accessFor(r.Context(), user)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, out)
}

func (a *Server) registerName(ctx context.Context, user, name string) error {
	return a.Store.Atomic(ctx, func(tx store.Transaction) error {
		row, e := tx.Lock("users", core.Record{ID: user})
		if e != nil {
			return e
		}
		var profile map[string]any
		if json.Unmarshal(row.Data, &profile) != nil || profile == nil {
			return fmt.Errorf("账号状态异常")
		}
		profile["name"] = name
		row.Data = core.Data(profile)
		_, e = tx.Put("users", row, row.Version)
		return e
	})
}

// verifyAndRegister runs under a row lock on the code, so concurrent guesses
// are counted one by one and a code can register only once. A wrong guess
// still commits its attempt; problem then explains the refusal.
func (a *Server) verifyAndRegister(ctx context.Context, user, name, phone, code string) (problem string, err error) {
	err = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		problem = ""
		row, e := tx.Lock("sms_codes", core.Record{ID: user})
		if errors.Is(e, core.ErrNotFound) {
			problem = "请先获取验证码"
			return nil
		} else if e != nil {
			return e
		}
		var c smsCode
		if json.Unmarshal(row.Data, &c) != nil {
			return fmt.Errorf("验证码记录异常")
		}
		switch {
		case c.Phone != phone:
			problem = "手机号与接收验证码的号码不一致"
		case c.Digest == "" || time.Now().After(c.ExpiresAt):
			problem = "验证码已失效，请重新获取"
		case c.Attempts >= smsMaxAttempts:
			problem = "验证码错误次数过多，请重新获取"
		}
		if problem != "" {
			return nil
		}
		wrong := subtle.ConstantTimeCompare([]byte(c.Digest), []byte(smsDigest(user, phone, code))) != 1
		if wrong {
			c.Attempts++
		} else if ok, e := claimPhone(tx, phone, user); e != nil || !ok {
			if !ok {
				problem = errPhoneTaken // the code is not consumed
			}
			return e
		} else {
			c.Digest = "" // a code registers once
		}
		if _, e = tx.Put("sms_codes", core.Record{ID: user, Owner: user, Data: core.Data(c)}, row.Version); e != nil {
			return e
		}
		if wrong {
			problem = "验证码不正确"
			return nil // commit the counted attempt
		}
		return saveProfile(tx, user, name, phone)
	})
	return
}

func saveProfile(tx store.Transaction, user, name, phone string) error {
	row, e := tx.Get("users", user)
	if e != nil {
		return e
	}
	var profile map[string]any
	if e = json.Unmarshal(row.Data, &profile); e != nil || profile == nil {
		return fmt.Errorf("账号状态异常")
	}
	if old, _ := profile["verifiedPhone"].(string); old != phone {
		if e = releasePhone(tx, old, user); e != nil {
			return e
		}
	}
	profile["name"], profile["phone"], profile["verifiedPhone"] = name, phone, phone
	profile["phoneVerifiedAt"] = time.Now().UTC().Format(time.RFC3339)
	row.Data = core.Data(profile)
	_, e = tx.Put("users", row, row.Version)
	return e
}
