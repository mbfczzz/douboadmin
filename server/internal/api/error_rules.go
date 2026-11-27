package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// 错误归档: an administrator files an upstream failure the first time it is
// seen — a fragment of its text and the words users should read instead — so
// every later failure with that text (any model, and earlier ones still on
// screen) tells users what happened rather than 系统异常. Users only ever see
// the administrator's words, never the upstream text.

type errorRule struct {
	Contains string `json:"contains"`
	Message  string `json:"message"`
	Action   string `json:"action,omitempty"`
	Deleted  bool   `json:"deleted,omitempty"`
}

func (r errorRule) valid() error {
	contains, message := strings.TrimSpace(r.Contains), strings.TrimSpace(r.Message)
	if n := utf8.RuneCountInString(contains); n < 2 || n > 200 {
		return fmt.Errorf("匹配内容需为 2–200 字")
	}
	if n := utf8.RuneCountInString(message); n < 2 || n > 60 {
		return fmt.Errorf("给用户的提示需为 2–60 字")
	}
	if utf8.RuneCountInString(r.Action) > 100 {
		return fmt.Errorf("建议操作最多 100 字")
	}
	if strings.ContainsAny(contains+message+r.Action, "\r\n") {
		return fmt.Errorf("请写成一行")
	}
	return nil
}

// errorRules is a short-lived copy of the live rules (failure views read it
// for every failed job on a page).
type errorRules struct {
	mu    sync.Mutex
	rules []errorRule
	at    time.Time
}

const ruleCacheTTL = 30 * time.Second

func (a *Server) liveErrorRules(ctx context.Context) []errorRule {
	ruleCache := &a.errorRules
	ruleCache.mu.Lock()
	defer ruleCache.mu.Unlock()
	if !ruleCache.at.IsZero() && time.Since(ruleCache.at) < ruleCacheTTL {
		return ruleCache.rules
	}
	rows, err := store.AllRecords(ctx, a.Store, "error_rules", "")
	if err != nil {
		return ruleCache.rules // keep the last copy rather than hide every rule
	}
	rules := []errorRule{}
	for _, row := range rows {
		var r errorRule
		if json.Unmarshal(row.Data, &r) == nil && !r.Deleted && strings.TrimSpace(r.Contains) != "" {
			rules = append(rules, r)
		}
	}
	// The longest fragment is the most specific match.
	sort.SliceStable(rules, func(i, j int) bool { return len(rules[i].Contains) > len(rules[j].Contains) })
	ruleCache.rules, ruleCache.at = rules, time.Now()
	return rules
}

func (a *Server) forgetErrorRules() {
	a.errorRules.mu.Lock()
	a.errorRules.at = time.Time{}
	a.errorRules.mu.Unlock()
}

// matchErrorRule finds the filed rule for a failure's upstream text.
func (a *Server) matchErrorRule(ctx context.Context, texts ...string) (errorRule, bool) {
	text := strings.ToLower(strings.Join(texts, "\n"))
	if strings.TrimSpace(text) == "" {
		return errorRule{}, false
	}
	for _, r := range a.liveErrorRules(ctx) {
		if strings.Contains(text, strings.ToLower(strings.TrimSpace(r.Contains))) {
			return r, true
		}
	}
	return errorRule{}, false
}

// GET /api/admin/error-rules
func (a *Server) errorRuleList(w http.ResponseWriter, r *http.Request) {
	rows, err := store.AllRecords(r.Context(), a.Store, "error_rules", "")
	if err != nil {
		dbError(w, err)
		return
	}
	out := []core.Record{}
	for _, row := range rows {
		var rule errorRule
		if json.Unmarshal(row.Data, &rule) == nil && !rule.Deleted {
			out = append(out, row)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	reply(w, 200, out)
}

// POST /api/admin/error-rules, PUT /api/admin/error-rules/{id}
func (a *Server) saveErrorRule(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Version int64     `json:"version"`
		Data    errorRule `json:"data"`
	}
	if !decode(w, r, &in) {
		return
	}
	rule := errorRule{Contains: strings.TrimSpace(in.Data.Contains), Message: strings.TrimSpace(in.Data.Message), Action: strings.TrimSpace(in.Data.Action)}
	if err := rule.valid(); err != nil {
		fail(w, 400, err.Error())
		return
	}
	id := r.PathValue("id")
	if id == "" {
		id, in.Version = core.NewID(), 0
	}
	row, err := a.Store.Put(r.Context(), "error_rules", core.Record{ID: id, Data: core.Data(rule)}, in.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	a.forgetErrorRules()
	reply(w, 200, row)
}

// DELETE /api/admin/error-rules/{id}: kept as deleted (operation history).
func (a *Server) deleteErrorRule(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Version int64 `json:"version"`
	}
	if !decode(w, r, &in) {
		return
	}
	row, err := a.Store.Get(r.Context(), "error_rules", r.PathValue("id"))
	var rule errorRule
	if err == nil && json.Unmarshal(row.Data, &rule) != nil {
		err = fmt.Errorf("记录格式无效")
	}
	if err == nil {
		rule.Deleted = true
		row.Data = core.Data(rule)
		_, err = a.Store.Put(r.Context(), "error_rules", row, in.Version)
	}
	if err != nil {
		dbError(w, err)
		return
	}
	a.forgetErrorRules()
	reply(w, 200, map[string]bool{"ok": true})
}
