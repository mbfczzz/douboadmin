package api

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
)

func (a *Server) loginLimit(w http.ResponseWriter, r *http.Request) bool {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	ok, e := a.Sessions.Allow(r.Context(), "login:"+ip, 30)
	if e != nil {
		fail(w, 503, "登录服务不可用")
		return false
	}
	if !ok {
		fail(w, 429, "登录过于频繁")
		return false
	}
	return true
}

func (a *Server) adminLogin(w http.ResponseWriter, r *http.Request) {
	if !a.loginLimit(w, r) {
		return
	}
	var v struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(w, r, &v) {
		return
	}
	if subtle.ConstantTimeCompare([]byte(v.Username), []byte(a.Config.AdminUser)) != 1 || subtle.ConstantTimeCompare([]byte(v.Password), []byte(a.Config.AdminPassword)) != 1 {
		fail(w, 401, "账号或密码不正确")
		return
	}
	t, e := a.Sessions.Create(r.Context(), "admin", "admin", v.Username)
	if e != nil {
		dbError(w, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "doubo_session", Value: t, Path: "/api", HttpOnly: true, Secure: a.Config.Production, SameSite: http.SameSiteStrictMode, MaxAge: 86400})
	reply(w, 200, map[string]string{"name": "管理员"})
}

func (a *Server) logout(w http.ResponseWriter, r *http.Request) {
	t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if c, e := r.Cookie("doubo_session"); e == nil && t == "" {
		t = c.Value
	}
	if e := a.Sessions.Delete(r.Context(), t); e != nil {
		dbError(w, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "doubo_session", Value: "", Path: "/api", MaxAge: -1, HttpOnly: true, Secure: a.Config.Production, SameSite: http.SameSiteStrictMode})
	reply(w, 200, map[string]bool{"ok": true})
}
