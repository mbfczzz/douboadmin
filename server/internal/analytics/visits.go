package analytics

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"sync"
	"time"
)

// PageView is one anonymous page show sent by the mini-program. It is never
// linked to the signed-in account.
type PageView struct {
	// Client is miniprogram (default), web or app; Source is a web referrer
	// host / channel or an app channel (scene stays WeChat-only).
	Client    string `json:"client"`
	Source    string `json:"source"`
	VisitID   string `json:"visitId"`
	VisitorID string `json:"visitorId"`
	Page      string `json:"page"`
	Scene     int    `json:"scene"`
	Platform  string `json:"platform"`
}

var (
	visitIDPattern  = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
	pagePattern     = regexp.MustCompile(`^pages/[a-z0-9-]+(/[a-z0-9-]+)*/index$`)
	webPagePattern  = regexp.MustCompile(`^/[A-Za-z0-9/_.\-]{0,119}$`)
	appPagePattern  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_./-]{0,59}$`)
	sourcePattern   = regexp.MustCompile(`^[a-z0-9_.:-]{0,40}$`)
	platformPattern = regexp.MustCompile(`^[a-z0-9_-]{0,16}$`)
)

const (
	repeatWindow = 2 * time.Second
	// A client starts a new visit after 30 minutes in the background; ids
	// still in use long after that are not extended.
	maxVisitAge  = 12 * time.Hour
	maxPageKeys  = 30
	maxSeenPages = 4096
)

// Valid reports whether v is well-formed for its client and normalises it
// in place (lower-case platform/source, one page for every share link).
func (v *PageView) Valid() bool {
	v.Platform, v.Source = strings.ToLower(v.Platform), strings.ToLower(v.Source)
	v.Client = core.VisitClient(v.Client)
	var page bool
	switch v.Client {
	case core.ClientMiniProgram:
		page = len(v.Page) <= 60 && pagePattern.MatchString(v.Page)
	case core.ClientWeb:
		// Every share link is one page: "/s/*".
		if strings.HasPrefix(v.Page, "/s/") {
			v.Page = "/s/*"
		}
		page = v.Page == "/s/*" || webPagePattern.MatchString(v.Page)
	case core.ClientApp:
		page = appPagePattern.MatchString(v.Page)
	}
	return page && visitIDPattern.MatchString(v.VisitID) && visitIDPattern.MatchString(v.VisitorID) &&
		v.Scene >= 0 && v.Scene <= 99999 && platformPattern.MatchString(v.Platform) && sourcePattern.MatchString(v.Source)
}

// Visits stores page views; the zero value with a Store is ready to use.
type Visits struct {
	Store store.Store
	mu    sync.Mutex
	seen  map[string]time.Time // visit + page → last accepted show
}

// Record counts a valid page view. Repeats of the same page within two
// seconds (double onShow, quick back-and-forth) are ignored.
func (s *Visits) Record(ctx context.Context, v PageView, now time.Time) error {
	if !s.fresh(v.Client+"\x00"+v.VisitID+"\x00"+v.Page, now) {
		return nil
	}
	err := s.write(ctx, v, now)
	if errors.Is(err, core.ErrConflict) {
		err = s.write(ctx, v, now)
	}
	return err
}

func (s *Visits) fresh(key string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.seen == nil || len(s.seen) >= maxSeenPages {
		old := s.seen
		s.seen = map[string]time.Time{}
		for k, at := range old {
			if now.Sub(at) < repeatWindow {
				s.seen[k] = at
			}
		}
	}
	if at, ok := s.seen[key]; ok && now.Sub(at) < repeatWindow {
		return false
	}
	s.seen[key] = now
	return true
}

func (s *Visits) write(ctx context.Context, v PageView, now time.Time) error {
	id := core.Digest("visit:" + v.VisitID)[:32]
	row, err := s.Store.Get(ctx, "visits", id)
	if errors.Is(err, core.ErrNotFound) {
		return s.start(ctx, id, v, now)
	}
	if err != nil {
		return err
	}
	var visit core.Visit
	if json.Unmarshal(row.Data, &visit) != nil || now.Sub(visit.FirstAt) > maxVisitAge {
		return nil
	}
	if visit.Counts == nil {
		visit.Counts = map[string]int64{}
	}
	visit.Pages++
	if _, ok := visit.Counts[v.Page]; ok || len(visit.Counts) < maxPageKeys {
		visit.Counts[v.Page]++
	}
	if now.After(visit.LastAt) {
		visit.LastAt = now
	}
	_, err = s.Store.Put(ctx, "visits", core.Record{ID: id, Data: core.Data(visit)}, row.Version)
	return err
}

func (s *Visits) start(ctx context.Context, id string, v PageView, now time.Time) error {
	day := now.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
	visitor := core.Digest("visitor:" + v.VisitorID)[:32]
	platform := v.Platform
	if platform == "" {
		platform = "unknown"
	}
	visit := core.Visit{Client: v.Client, Source: v.Source, Day: day, Visitor: visitor, Scene: v.Scene, Platform: platform, Entry: v.Page, Pages: 1, Counts: map[string]int64{v.Page: 1}, FirstAt: now, LastAt: now}
	if _, err := s.Store.Put(ctx, "visits", core.Record{ID: id, Data: core.Data(visit)}, 0); err != nil {
		return err
	}
	// Once per visit: a conflict means the visitor was seen before.
	_, err := s.Store.Put(ctx, "visitors", core.Record{ID: visitor, Data: core.Data(core.Visitor{FirstDay: day, Client: v.Client})}, 0)
	if errors.Is(err, core.ErrConflict) {
		return nil
	}
	return err
}
