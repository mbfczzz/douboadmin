package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"log/slog"
	"net/http"
	"slices"
)

// 生成默认服装: one image job per default outfit (defaultOutfits) with the
// chosen image model, owned by the administrator (not billed). Each outfit
// is a draft with its job until the picture is in; collectOutfitSeeds then
// attaches it and publishes the outfit. Outfits already pictured, still
// drawing or deleted are left alone, so pressing again redoes only failures.

func pick(options []string, wanted ...string) string {
	for _, w := range wanted {
		if len(options) == 0 || slices.Contains(options, w) {
			return w
		}
	}
	return options[0]
}

func (a *Server) seedOutfits(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Model string `json:"model"`
	}
	if !decode(w, r, &v) {
		return
	}
	ctx, admin := r.Context(), identity(r).ID
	m, err := a.model(ctx, v.Model)
	if err != nil || m.Kind != "image" {
		fail(w, 400, "请选择图片模型")
		return
	}
	in := core.JobInput{Kind: "image", Model: m.ID, Prompt: outfitPicture(defaultOutfits[0].Description),
		Ratio: pick(m.Ratios, "3:4", "2:3", "1:1"), Resolution: pick(m.Resolutions, "2K", "2k", "1K", "1k"), Quality: pick(m.Qualities, "high", "medium")}
	if len(m.Resolutions) == 0 {
		in.Resolution = ""
	}
	if len(m.Qualities) == 0 {
		in.Quality = ""
	}
	if err := a.validateJob(ctx, admin, &in); err != nil {
		fail(w, 400, err.Error())
		return
	}
	started := 0
	for i, d := range defaultOutfits {
		id := "default-" + d.ID
		var o core.Outfit
		row, err := a.Store.Get(ctx, "outfits", id)
		if err == nil && (json.Unmarshal(row.Data, &o) != nil || o.Deleted || o.ImageAssetID != "" || o.SeedJob != "") {
			continue
		}
		job := in
		job.Prompt = outfitPicture(d.Description)
		j := core.NewJob(admin, "outfit-default:"+d.ID+":"+core.NewID(), job)
		if j, err = a.Store.CreateJob(ctx, j); err != nil {
			dbError(w, err)
			return
		}
		o = core.Outfit{Title: d.Title, Category: d.Category, Description: d.Description, Sort: 1000 + i, SeedJob: j.ID}
		if _, err = a.Store.Put(ctx, "outfits", core.Record{ID: id, Data: core.Data(o)}, row.Version); err != nil {
			dbError(w, err)
			return
		}
		started++
	}
	reply(w, 200, map[string]int{"started": started, "total": len(defaultOutfits)})
}

// collectOutfitSeeds attaches finished pictures (best effort; the admin
// list calls it) and reports how many are still drawing.
func (a *Server) collectOutfitSeeds(ctx context.Context) int {
	page, err := a.Store.RecordPage(ctx, core.RecordQuery{Namespace: "outfits", Fields: map[string]string{"deleted": "false"}, NotFields: map[string]string{"seedJob": ""}, Page: 1, Size: 100})
	if err != nil {
		return 0
	}
	waiting := 0
	for _, row := range page.Items {
		var o core.Outfit
		if json.Unmarshal(row.Data, &o) != nil {
			continue
		}
		j, err := a.Store.Job(ctx, o.SeedJob)
		switch {
		case err != nil:
			o.SeedError = "生成任务不存在"
		case j.Status == "failed" || j.Status == "cancelled":
			o.SeedError = j.Error
			if o.SeedError == "" {
				o.SeedError = "生成失败"
			}
		case j.Status != "succeeded":
			waiting++
			continue
		default:
			if !a.attachSeedPicture(ctx, j, &o) {
				o.SeedError = "生成结果不可用"
			}
		}
		o.SeedJob = ""
		if _, err := a.Store.Put(ctx, "outfits", core.Record{ID: row.ID, Data: core.Data(o)}, row.Version); err != nil && err != core.ErrConflict {
			slog.Warn("outfit seed", "id", row.ID, "error", err)
		}
	}
	return waiting
}

func (a *Server) attachSeedPicture(ctx context.Context, j core.Job, o *core.Outfit) bool {
	refs, err := core.ResultRefs(j.Result)
	if err != nil || len(refs) == 0 {
		return false
	}
	id := refs[0]
	if len(id) < 7 || id[:6] != "asset:" {
		return false
	}
	row, err := a.Store.Get(ctx, "assets", id[6:])
	var file struct {
		Key  string `json:"key"`
		Type string `json:"type"`
		Size int64  `json:"size"`
	}
	if err != nil || json.Unmarshal(row.Data, &file) != nil || file.Key == "" {
		return false
	}
	o.ImageAssetID, o.ImageKey, o.ImageType, o.ImageSize = row.ID, file.Key, file.Type, file.Size
	o.Published, o.SeedError = true, ""
	return true
}
