package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
)

func (a *Server) mixConfig(w http.ResponseWriter, r *http.Request) {
	_, settings, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	rows, e := a.Store.List(r.Context(), "models", "")
	if e != nil {
		dbError(w, e)
		return
	}
	voices := []map[string]any{}
	rewriteReady := false
	ttsReady := false
	for _, row := range rows {
		var m core.Model
		if json.Unmarshal(row.Data, &m) != nil || !m.Effective().Usable() {
			continue
		}
		if m.ID == settings.RewriteModel && m.Kind == "chat" {
			rewriteReady = a.Relay.Ready()
		}
		if m.Kind == "audio" {
			var schema struct {
				Voices []string `json:"voice"`
			}
			_ = json.Unmarshal(m.ParamsSchema, &schema)
			voices = append(voices, map[string]any{"id": m.ID, "name": m.Name, "voices": schema.Voices})
			if m.ID == settings.TTSModel {
				ttsReady = a.Relay.Ready()
			}
		}
	}
	asr := a.Mix != nil && a.Mix.ASR.Ready()
	reply(w, 200, map[string]any{"enabled": a.Mix.Ready(), "asr": asr, "rewrite": rewriteReady, "tts": ttsReady, "ttsModel": settings.TTSModel, "rewriteModel": settings.RewriteModel, "voiceModels": voices, "points": settings.MixPoints, "billingEnabled": settings.BillingEnabled, "resolutions": []string{"720p", "1080p"}, "ratios": []string{"9:16", "16:9", "1:1"}, "maxDuration": 120, "maxAssets": 10, "maxTotalMB": 200})
}
