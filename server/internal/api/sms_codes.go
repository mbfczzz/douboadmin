package api

import (
	"context"
	"crypto/rand"
	"doubo/server/internal/core"
	"doubo/server/internal/sms"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// SMSSender delivers verification codes (Alibaba Cloud SMS in production).
type SMSSender interface {
	Ready() bool
	Send(ctx context.Context, phone, code string) error
}

const (
	smsTTL         = 5 * time.Minute
	smsDailyLimit  = 10
	smsMaxAttempts = 5
)

var mainlandPhone = regexp.MustCompile(`^1[3-9][0-9]{9}$`)
var smsDigits = regexp.MustCompile(`^[0-9]{6}$`)

// smsCode is the latest code sent to a user; only its digest is stored.
type smsCode struct {
	Phone     string    `json:"phone"`
	Digest    string    `json:"digest"`
	ExpiresAt time.Time `json:"expiresAt"`
	Attempts  int       `json:"attempts"`
	smsDay
}

func smsDigest(user, phone, code string) string { return core.Digest(user + ":" + phone + ":" + code) }

func (a *Server) smsCode(ctx context.Context, user string) (core.Record, smsCode, error) {
	return recordOf[smsCode](ctx, a.Store, "sms_codes", user)
}

type limit struct {
	key string
	max int
}

// allowAll checks per-minute limits in order and stops at the first refusal.
func (a *Server) allowAll(w http.ResponseWriter, r *http.Request, message string, limits ...limit) bool {
	for _, l := range limits {
		ok, e := a.Sessions.Allow(r.Context(), l.key, l.max)
		if e != nil {
			fail(w, 503, "限流服务不可用")
			return false
		}
		if !ok {
			fail(w, 429, message)
			return false
		}
	}
	return true
}

// smsReady reports a configured provider; smsDebug is the local demo mode
// (demo login on, never in production) that shows codes instead of sending.
func (a *Server) smsReady() bool { return a.SMS != nil && a.SMS.Ready() }
func (a *Server) smsDebug() bool { return !a.smsReady() && a.demoLoginEnabled() }

// registrationRequired: the SMS step is enforced only when codes can be
// delivered, so deploying before configuring SMS never locks everyone out.
func (a *Server) registrationRequired() bool {
	return a.Config.RequireActivation && (a.smsReady() || a.smsDebug())
}

// smsDay counts sends per Beijing-time day.
type smsDay struct {
	Day  string `json:"day"`
	Sent int    `json:"sent"`
}

func (d *smsDay) full(today string) bool {
	if d.Day != today {
		d.Day, d.Sent = today, 0
	}
	return d.Sent >= smsDailyLimit
}

func (a *Server) sendSMSCode(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Phone string `json:"phone"`
	}
	if !decode(w, r, &v) {
		return
	}
	user, phone := identity(r).ID, strings.TrimSpace(v.Phone)
	if !mainlandPhone.MatchString(phone) {
		fail(w, 400, "请输入 11 位手机号")
		return
	}
	if !a.smsReady() && !a.smsDebug() {
		fail(w, 503, "短信服务尚未配置，请联系管理员")
		return
	}
	if !a.allowAll(w, r, "发送过于频繁，请 60 秒后再试", limit{"sms-ip:" + clientIP(r), 10}, limit{"sms-user:" + user, 1}, limit{"sms-phone:" + phone, 1}) {
		return
	}
	ctx, today := r.Context(), time.Now().In(reportZone).Format("2006-01-02")
	if taken, e := a.phoneTaken(ctx, phone, user); e != nil {
		dbError(w, e)
		return
	} else if taken {
		fail(w, 400, errPhoneTaken)
		return
	}
	row, c, e := a.smsCode(ctx, user)
	if e != nil && !errors.Is(e, core.ErrNotFound) {
		dbError(w, e)
		return
	}
	prow, p, e := recordOf[smsDay](ctx, a.Store, "sms_phones", phone)
	if e != nil && !errors.Is(e, core.ErrNotFound) {
		dbError(w, e)
		return
	}
	if c.smsDay.full(today) || p.full(today) {
		fail(w, 429, "今日验证码发送次数已达上限，请明天再试")
		return
	}
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	code := fmt.Sprintf("%06d", n.Int64())
	out := map[string]any{"expiresIn": int(smsTTL.Seconds()), "resendIn": 60}
	if a.smsDebug() {
		out["debugCode"] = code
	} else if e = a.SMS.Send(ctx, phone, code); e != nil {
		switch {
		case errors.Is(e, sms.ErrRateLimited):
			fail(w, 429, e.Error())
		case errors.Is(e, sms.ErrInvalidPhone):
			fail(w, 400, e.Error())
		default:
			slog.Warn("sms send failed", "error", e.Error())
			fail(w, 502, "短信发送失败，请稍后重试")
		}
		return // the previous code, if any, stays valid
	}
	c.Phone, c.Digest, c.ExpiresAt, c.Attempts = phone, smsDigest(user, phone, code), time.Now().Add(smsTTL), 0
	c.Sent++
	p.Sent++
	e = a.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, e := tx.Put("sms_codes", core.Record{ID: user, Owner: user, Data: core.Data(c)}, row.Version); e != nil {
			return e
		}
		_, e := tx.Put("sms_phones", core.Record{ID: phone, Data: core.Data(p)}, prow.Version)
		return e
	})
	if errors.Is(e, core.ErrConflict) {
		fail(w, 429, "发送过于频繁，请 60 秒后再试")
		return
	} else if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, out)
}

// recordOf reads one JSON record; a missing record yields the zero value.
func recordOf[T any](ctx context.Context, s store.Store, ns, id string) (core.Record, T, error) {
	var v T
	row, e := s.Get(ctx, ns, id)
	if e == nil && json.Unmarshal(row.Data, &v) != nil {
		e = fmt.Errorf("记录格式异常")
	}
	return row, v, e
}
