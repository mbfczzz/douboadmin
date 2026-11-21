package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"time"
)

// 功能使用 (后台 → 日志管理): per day and function, how often its entry was
// tapped (clicks, sent by the mini-program, anonymous) and how many tasks
// were submitted with it (uses, counted here). Counters only, no user.

var statsZone = time.FixedZone("CST", 8*3600)

type featureStat struct {
	Day     string `json:"day"`
	Feature string `json:"feature"`
	Clicks  int64  `json:"clicks"`
	Uses    int64  `json:"uses"`
}

// countFeature adds one click or use; statistics never fail a request.
func (a *Server) countFeature(ctx context.Context, feature string, use bool) {
	if !core.IsFeature(feature) {
		return
	}
	day := time.Now().In(statsZone).Format("2006-01-02")
	id := day + ":" + feature
	err := a.Store.Atomic(ctx, func(tx store.Transaction) error {
		row, err := tx.Lock("feature_stats", core.Record{ID: id, Data: core.Data(featureStat{Day: day, Feature: feature})})
		if err != nil {
			return err
		}
		var s featureStat
		if err = json.Unmarshal(row.Data, &s); err != nil {
			return err
		}
		if use {
			s.Uses++
		} else {
			s.Clicks++
		}
		row.Data = core.Data(s)
		_, err = tx.Put("feature_stats", row, row.Version)
		return err
	})
	if err != nil {
		slog.Warn("feature stats", "feature", feature, "error", err)
	}
}

// featureClick: POST /api/features/{key}/click, anonymous like visits.
func (a *Server) featureClick(w http.ResponseWriter, r *http.Request) {
	if a.clickLimit.allow(clientIP(r), time.Now()) {
		a.countFeature(r.Context(), r.PathValue("key"), false)
	}
	w.WriteHeader(204)
}

// featureUse: functions that run without a task (文案提取) say they were used.
func (a *Server) featureUse(w http.ResponseWriter, r *http.Request) {
	if key := r.PathValue("key"); key == "extract" {
		a.countFeature(r.Context(), key, true)
	}
	w.WriteHeader(204)
}

type featureRow struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Clicks int64  `json:"clicks"`
	Uses   int64  `json:"uses"`
}

// featureStats: every function with its clicks and uses over the last
// days (1 = today), most used first; daily totals for the trend.
func (a *Server) featureStats(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if !slices.Contains([]int{1, 7, 30, 90}, days) {
		days = 7
	}
	now := time.Now().In(statsZone)
	list := make([]string, days)
	for i := range list {
		list[i] = now.AddDate(0, 0, i-days+1).Format("2006-01-02")
	}
	totals := map[string]*featureRow{}
	rows := []featureRow{}
	for _, f := range core.Features {
		rows = append(rows, featureRow{Key: f.Key, Name: f.Name})
	}
	for i := range rows {
		totals[rows[i].Key] = &rows[i]
	}
	daily := map[string]*featureStat{}
	for _, d := range list {
		daily[d] = &featureStat{Day: d}
	}
	q := core.RecordQuery{Namespace: "feature_stats", FieldsIn: map[string][]string{"day": list}, ByID: true, Page: 1, Size: 100}
	for {
		page, err := a.Store.RecordPage(r.Context(), q)
		if err != nil {
			dbError(w, err)
			return
		}
		for _, row := range page.Items {
			var s featureStat
			if json.Unmarshal(row.Data, &s) != nil || totals[s.Feature] == nil || daily[s.Day] == nil {
				continue
			}
			totals[s.Feature].Clicks += s.Clicks
			totals[s.Feature].Uses += s.Uses
			daily[s.Day].Clicks += s.Clicks
			daily[s.Day].Uses += s.Uses
		}
		if len(page.Items) < q.Size {
			break
		}
		q.AfterID = page.Items[len(page.Items)-1].ID
	}
	slices.SortStableFunc(rows, func(x, y featureRow) int {
		if x.Uses != y.Uses {
			return int(y.Uses - x.Uses)
		}
		return int(y.Clicks - x.Clicks)
	})
	trend := []featureStat{}
	for _, d := range list {
		trend = append(trend, *daily[d])
	}
	reply(w, 200, map[string]any{"days": days, "features": rows, "trend": trend})
}
