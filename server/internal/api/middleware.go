package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

func (a *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		origin := r.Header.Get("Origin")
		if origin != "" {
			u, _ := url.Parse(origin)
			if !slices.Contains(strings.Split(a.Config.WebOrigin, ","), origin) && (u == nil || u.Host != r.Host) {
				fail(w, 403, "来源不允许")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		defer func() {
			if e := recover(); e != nil {
				slog.Error("request panic", "error", e)
				fail(w, 500, "服务异常")
			}
		}()
		if a.Audit != nil && audited(r) {
			a.serveAudited(w, r)
			return
		}
		a.Mux.ServeHTTP(w, r)
	})
}

func (a *Server) auth(role string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if c, e := r.Cookie("doubo_session"); e == nil && t == "" {
			t = c.Value
		}
		v, err := a.Sessions.Get(r.Context(), t)
		if err != nil {
			if errors.Is(err, core.ErrNotFound) {
				fail(w, 401, "请先登录")
			} else {
				dbError(w, err)
			}
			return
		}
		// Known caller from here on, so even refused requests are attributed.
		auditActor(r, v)
		if role != "" && v.Role != role {
			fail(w, 403, "没有操作权限")
			return
		}
		if v.Role == "admin" && v.AdminRole != "" {
			row, e := a.Store.Get(r.Context(), "admin_accounts", v.ID)
			if e != nil {
				dbError(w, e)
				return
			}
			var account core.AdminAccount
			if json.Unmarshal(row.Data, &account) != nil || account.Disabled || account.Archived {
				fail(w, 403, "管理账号已停用")
				return
			}
			role, denied, e := a.adminAccess(r.Context(), account)
			if e != nil {
				dbError(w, e)
				return
			}
			if denied != "" {
				fail(w, 403, denied)
				return
			}
			changed := v.PasswordVersion != "" && v.PasswordVersion != passwordVersion(account.PasswordChangedAt)
			legacyExpired := v.PasswordVersion == "" && v.Expires.Add(-24*time.Hour).Before(account.PasswordChangedAt)
			if changed || legacyExpired {
				fail(w, 401, "密码已修改，请重新登录")
				return
			}
			v.AdminRole, v.PartnerID, v.Menus = account.Role, account.PartnerID, role.Menus
			if !menuAllowed(account.Role, role.Menus, r.Method, r.URL.Path) {
				fail(w, 403, "没有该菜单的访问权限")
				return
			}
		}
		// A user must be able to revoke a session even after exhausting the API quota.
		if r.URL.Path == "/api/auth/logout" {
			h(w, r.WithContext(context.WithValue(r.Context(), identityKey, v)))
			return
		}
		if v.Role == "user" {
			flags, e := a.userState(r.Context(), v.ID)
			if e != nil && !errors.Is(e, core.ErrNotFound) { // Legacy private sessions can predate profiles; public shares cannot.
				dbError(w, e)
				return
			}
			if flags.Disabled {
				fail(w, 403, "账号已停用，请联系管理员")
				return
			}
			if !a.allowActivation(w, r, v.ID, flags.Registered) {
				return
			}
		}
		ok, err := a.Sessions.Allow(r.Context(), v.ID, 180)
		if err != nil {
			fail(w, 503, "限流服务不可用")
			return
		}
		if !ok {
			fail(w, 429, "操作过于频繁，请稍后再试")
			return
		}
		if v.Role == "user" && a.Activity != nil {
			a.Activity.Active(r.Context(), v.ID)
		}
		auditActor(r, v) // now with provider scope resolved
		h(w, r.WithContext(context.WithValue(r.Context(), identityKey, v)))
	}
}
