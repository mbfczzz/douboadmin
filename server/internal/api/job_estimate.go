package api

import (
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"net/http"
	"slices"
	"strconv"
	"strings"
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
	if value := strings.TrimSpace(q.Get("assets")); value != "" {
		in.Assets = strings.Split(value, ",")
		if len(in.Assets) > 20 {
			fail(w, 400, "参考素材过多")
			return
		}
		for _, id := range in.Assets {
			row, e := a.Store.Get(r.Context(), "assets", id)
			if e != nil || row.Owner != identity(r).ID {
				fail(w, 400, "参考素材不存在或不属于当前用户")
				return
			}
		}
	}
	m, err := a.model(r.Context(), in.Model)
	if err != nil {
		dbError(w, err)
		return
	}
	if !m.Usable() || m.Kind != in.Kind || !core.ParameterValuesAllowed(in.Kind, in.Resolution, in.Ratio, in.Quality, in.Duration) ||
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
	units, perSecond, err := billing.QuoteDetail(m, in)
	if err != nil {
		dbError(w, err)
		return
	}
	if !settings.BillingEnabled {
		units = 0
	}
	referenceUnits := int64(0)
	if settings.BillingEnabled && m.Settings.ReferenceVideoBilling && len(in.Assets) > 0 {
		seconds, e := a.referenceSeconds(r.Context(), in)
		if e == nil {
			referenceUnits, e = core.ReferenceVideoUnits(m, in, seconds)
		}
		if e != nil {
			quoteError(w, e)
			return
		}
		units += referenceUnits
	}
	// perSecond: video priced by duration (按秒); perToken: 火山方舟 Seedance,
	// units is the most it can cost (按量); otherwise a flat 按次 price.
	_, perToken := core.ArkVideo(m.Key)
	reply(w, 200, map[string]any{"units": units, "billingEnabled": settings.BillingEnabled, "perSecond": perSecond, "perToken": perToken, "referenceUnits": referenceUnits})
}
