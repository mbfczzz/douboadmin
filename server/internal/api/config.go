package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"sort"
	"time"
)

const catalogTimeout = 40 * time.Second

func (a *Server) config(w http.ResponseWriter, r *http.Request) {
	full, e := a.fullConfig(r)
	if e != nil {
		dbError(w, e)
		return
	}
	if !full {
		reply(w, 200, map[string]any{"activationRequired": true, "demo": false, "demoLogin": a.demoLoginEnabled(), "wechatLogin": a.Config.WeChatAppID != "" && a.Config.WeChatSecret != "", "models": []core.Model{}, "categories": []string{}, "relayConfigured": a.Relay.Ready(), "mixAvailable": false, "mixMessage": "混剪功能暂未开放", "storage": a.Config.Storage})
		return
	}
	rows, err := store.AllRecords(r.Context(), a.Store, "models", "")
	if err != nil {
		dbError(w, err)
		return
	}
	models := []core.Model{}
	for _, row := range rows {
		var m core.Model
		if json.Unmarshal(row.Data, &m) == nil && m.Usable() && a.Relay.Ready() {
			m = m.Effective()
			if !m.Usable() {
				continue
			}
			m.Settings.CostUSD = ""
			m.Icon = m.DisplayIcon()
			m.Settings.ErrorHints = nil
			m.ReferenceRules = publicReferenceRules(m)
			m.ResolutionByMode = publicModeResolutions(m)
			m.ParamsSchema = nil
			m.PriceModifiers = nil
			models = append(models, m)
		}
	}
	sort.Slice(models, func(i, j int) bool {
		if models[i].Sort == models[j].Sort {
			return models[i].ID < models[j].ID
		}
		return models[i].Sort < models[j].Sort
	})
	templates, err := store.AllRecords(r.Context(), a.Store, "templates", "")
	if err != nil {
		dbError(w, err)
		return
	}
	categories := []string{"推荐"}
	seen := map[string]bool{"推荐": true}
	for _, row := range templates {
		var t core.Template
		if json.Unmarshal(row.Data, &t) == nil && t.Published && !t.Deleted && t.Category != "" && !seen[t.Category] {
			categories = append(categories, t.Category)
			seen[t.Category] = true
		}
	}
	sort.Strings(categories[1:])
	completion := ""
	if a.Config.CompletionReady {
		completion = a.Config.CompletionTemplateID
	}
	reply(w, 200, map[string]any{"demo": false, "demoLogin": a.demoLoginEnabled(), "wechatLogin": a.Config.WeChatAppID != "" && a.Config.WeChatSecret != "",
		"activationRequired": a.Config.RequireActivation, "storage": a.Config.Storage, "models": models, "categories": categories, "relayConfigured": a.Relay.Ready(), "mixAvailable": false, "mixMessage": "混剪功能暂未开放", "completionTemplateId": completion})
}
