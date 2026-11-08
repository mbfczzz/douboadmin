package api

import (
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"net/http"
	"slices"
	"strconv"
)

// Estimate pricing without requiring a prompt, uploaded references, or wallet writes.
func (a *Server) estimateJob(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	in := core.JobInput{Kind: q.Get("kind"), Model: q.Get("model"), Resolution: q.Get("resolution"), Ratio: q.Get("ratio"), Quality: q.Get("quality")}
	if in.Kind != "image" && in.Kind != "video" {
		fail(w, 400, "该类型暂不支持预估")
		return
	}
	if value := q.Get("duration"); value != "" {
		var err error
		in.Duration, err = strconv.Atoi(value)
		if err != nil || in.Duration < 0 {
			fail(w, 400, "视频时长无效")
			return
		}
	}
	m, err := a.model(r.Context(), in.Model)
	if err != nil {
		dbError(w, err)
		return
	}
	if !m.Usable() || m.Kind != in.Kind ||
		(len(m.Resolutions) > 0 && !slices.Contains(m.Resolutions, in.Resolution)) ||
		(len(m.Ratios) > 0 && !slices.Contains(m.Ratios, in.Ratio)) ||
		(len(m.Qualities) > 0 && !slices.Contains(m.Qualities, in.Quality)) ||
		(in.Kind == "video" && !slices.Contains(m.Durations, in.Duration)) {
		fail(w, 400, "请选择模型支持的生成参数")
		return
	}
	_, settings, err := a.platform(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	units, err := billing.Quote(m, in)
	if err != nil {
		dbError(w, err)
		return
	}
	if !settings.BillingEnabled {
		units = 0
	}
	reply(w, 200, map[string]any{"units": units, "billingEnabled": settings.BillingEnabled})
}
