package api

import (
	"context"
	"crypto/rand"
	"doubo/server/internal/analytics"
	"doubo/server/internal/core"
	"encoding/hex"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	botAgent    = regexp.MustCompile(`(?i)bot|spider|crawl|slurp|preview|curl|wget|python|go-http|headless|okhttp|facebookexternalhit`)
	cookieID    = regexp.MustCompile(`^[a-f0-9]{32}$`)
	sourceToken = regexp.MustCompile(`^[a-z0-9_.:-]{1,40}$`)
)

// countWebView counts a server-rendered web page (e.g. the 作品分享页) as an
// anonymous web visit. Two first-party cookies hold random ids: a visitor id
// (one year) and a visit id that lapses after 30 idle minutes. Nothing links
// them to an account. It must run before the page body is written.
func (a *Server) countWebView(w http.ResponseWriter, r *http.Request, page string) {
	if a.Visits == nil || r.Method != http.MethodGet || botAgent.MatchString(r.UserAgent()) {
		return
	}
	id := func(name string, maxAge int) string {
		v := ""
		if c, err := r.Cookie(name); err == nil && cookieID.MatchString(c.Value) {
			v = c.Value
		} else {
			b := make([]byte, 16)
			_, _ = rand.Read(b)
			v = hex.EncodeToString(b)
		}
		http.SetCookie(w, &http.Cookie{Name: name, Value: v, Path: "/s", MaxAge: maxAge, HttpOnly: true, Secure: a.Config.Production, SameSite: http.SameSiteLaxMode})
		return v
	}
	view := analytics.PageView{
		Client: core.ClientWeb, Page: page, Source: webSource(r), Platform: webPlatform(r.UserAgent()),
		VisitorID: id("doubo_vid", 365*24*3600), VisitID: id("doubo_visit", 30*60),
	}
	if !view.Valid() {
		return
	}
	// Off the response path: the page never waits for the counter.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = a.Visits.Record(ctx, view, time.Now().UTC())
	}()
}

// webSource: an explicit ?utm_source=, else the referring site, else
// "wechat" inside WeChat's browser, else "direct".
func webSource(r *http.Request) string {
	if s := strings.ToLower(r.URL.Query().Get("utm_source")); sourceToken.MatchString(s) {
		return s
	}
	if u, err := url.Parse(r.Referer()); err == nil && u.Host != "" && u.Host != r.Host {
		return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	}
	if strings.Contains(r.UserAgent(), "MicroMessenger") {
		return "wechat"
	}
	return "direct"
}

func webPlatform(ua string) string {
	switch {
	case strings.Contains(ua, "iPhone"), strings.Contains(ua, "iPad"):
		return "ios"
	case strings.Contains(ua, "Android"):
		return "android"
	case strings.Contains(ua, "Windows"):
		return "windows"
	case strings.Contains(ua, "Macintosh"):
		return "mac"
	}
	return "other"
}
