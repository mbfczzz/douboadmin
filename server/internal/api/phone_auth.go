package api

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
)

type phoneLoginCode struct {
	Phone     string    `json:"phone"`
	Source    string    `json:"source"`
	Challenge string    `json:"challenge"`
	Digest    string    `json:"digest"`
	ExpiresAt time.Time `json:"expiresAt"`
	Attempts  int       `json:"attempts"`
}

func loginSource(v string) string {
	if v == "" {
		return "app"
	}
	return v
}
func validSource(v string) bool       { return v == "app" || v == "other" || v == "miniprogram" }
func loginCodeID(phone string) string { return core.Digest("phone-login:" + phone) }

func (a *Server) sendPhoneLoginCode(w http.ResponseWriter, r *http.Request) {
	var v struct{ Phone, Source string }
	if !decode(w, r, &v) {
		return
	}
	v.Phone = strings.TrimSpace(v.Phone)
	v.Source = loginSource(v.Source)
	if !mainlandPhone.MatchString(v.Phone) || !validSource(v.Source) {
		fail(w, 400, "手机号或账号来源无效")
		return
	}
	// Authentication never inherits the optional profile-verification switch.
	if !a.smsReady() {
		fail(w, 503, "短信登录服务尚未配置，请联系管理员")
		return
	}
	if !a.allowAll(w, r, "发送过于频繁，请60秒后再试", limit{"sms-ip:" + clientIP(r), 10}, limit{"sms-phone:" + v.Phone, 1}) {
		return
	}
	prow, day, e := recordOf[smsDay](r.Context(), a.Store, "sms_phones", v.Phone)
	if e != nil && !errors.Is(e, core.ErrNotFound) {
		dbError(w, e)
		return
	}
	if day.full(time.Now().In(reportZone).Format("2006-01-02")) {
		fail(w, 429, "今日验证码次数已达上限")
		return
	}
	old, _, e := recordOf[phoneLoginCode](r.Context(), a.Store, "phone_login_codes", loginCodeID(v.Phone))
	if e != nil && !errors.Is(e, core.ErrNotFound) {
		dbError(w, e)
		return
	}
	n, e := rand.Int(rand.Reader, big.NewInt(1000000))
	if e != nil {
		fail(w, 503, "验证码生成失败")
		return
	}
	code, challenge := fmt.Sprintf("%06d", n.Int64()), core.NewID()
	if e = a.SMS.Send(r.Context(), v.Phone, code); e != nil {
		fail(w, 502, "短信发送失败，请稍后重试")
		return
	}
	data := phoneLoginCode{Phone: v.Phone, Source: v.Source, Challenge: challenge, Digest: smsDigest(challenge, v.Phone, code), ExpiresAt: time.Now().Add(smsTTL)}
	day.Sent++
	e = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		if _, e := tx.Put("phone_login_codes", core.Record{ID: loginCodeID(v.Phone), Data: core.Data(data)}, old.Version); e != nil {
			return e
		}
		_, e := tx.Put("sms_phones", core.Record{ID: v.Phone, Data: core.Data(day)}, prow.Version)
		return e
	})
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"challenge": challenge, "expiresIn": int(smsTTL.Seconds()), "resendIn": 60})
}

func (a *Server) phoneLogin(w http.ResponseWriter, r *http.Request) {
	var v struct{ Phone, Code, Challenge, Source string }
	if !decode(w, r, &v) {
		return
	}
	v.Phone = strings.TrimSpace(v.Phone)
	v.Source = loginSource(v.Source)
	if !mainlandPhone.MatchString(v.Phone) || !smsDigits.MatchString(v.Code) || !validSource(v.Source) || len(v.Challenge) != 32 {
		fail(w, 400, "手机号、验证码或来源无效")
		return
	}
	if !a.allowAll(w, r, "登录尝试过于频繁", limit{"phone-login-ip:" + clientIP(r), 30}, limit{"phone-login:" + v.Phone, 10}) {
		return
	}
	// Resolve legacy phone rows before the transaction; the owner lock settles races.
	candidate, e := a.phoneCandidate(r.Context(), v.Phone)
	if e != nil {
		dbError(w, e)
		return
	}
	user, problem, isNew := "", "", false
	e = a.Store.Atomic(r.Context(), func(tx store.Transaction) error {
		if e := lockIdentity(tx); e != nil {
			return e
		}
		row, e := tx.Lock("phone_login_codes", core.Record{ID: loginCodeID(v.Phone)})
		if errors.Is(e, core.ErrNotFound) {
			problem = "请先获取登录验证码"
			return nil
		}
		if e != nil {
			return e
		}
		var c phoneLoginCode
		if json.Unmarshal(row.Data, &c) != nil {
			return errors.New("验证码记录异常")
		}
		if c.Challenge != v.Challenge || c.Source != v.Source || c.Digest == "" || time.Now().After(c.ExpiresAt) || c.Attempts >= smsMaxAttempts {
			problem = "验证码已失效或验证次数过多，请重新获取"
			return nil
		}
		if subtle.ConstantTimeCompare([]byte(c.Digest), []byte(smsDigest(v.Challenge, v.Phone, v.Code))) != 1 {
			c.Attempts++
			row.Data = core.Data(c)
			_, e = tx.Put("phone_login_codes", row, row.Version)
			problem = "验证码不正确"
			return e
		}
		user, isNew, e = a.resolvePhoneUser(tx, v.Phone, candidate, v.Source, false)
		if e != nil {
			return e
		}
		c.Digest = ""
		row.Data = core.Data(c)
		_, e = tx.Put("phone_login_codes", row, row.Version)
		return e
	})
	if e != nil {
		dbError(w, e)
		return
	}
	if problem != "" {
		fail(w, 400, problem)
		return
	}
	token, e := a.Sessions.Create(r.Context(), user, "user")
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"token": token, "userId": user, "expiresIn": 86400, "provider": "phone", "isNewUser": isNew, "source": v.Source, "activationRequired": a.Config.RequireActivation})
}

func (a *Server) phoneCandidate(ctx context.Context, phone string) (string, error) {
	rows, e := a.Store.RecordPage(ctx, core.RecordQuery{Namespace: "users", Fields: map[string]string{"phone": phone, "archived": "false"}, Page: 1, Size: 2})
	if e != nil {
		return "", e
	}
	if rows.Total > 1 {
		return "", errIdentityMerge
	}
	if len(rows.Items) > 0 {
		return rows.Items[0].ID, nil
	}
	return "", nil
}
