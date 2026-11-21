package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"
)

// 我的服装 (AI试衣 → 服装 → 我的): a user's own outfits. 上传 keeps their
// picture as it is; AI生成 is an ordinary image job the client submitted
// (priced and confirmed like any other) whose result becomes the outfit
// once it is done. Only the owner sees or uses them.

type myOutfit struct {
	Title   string `json:"title"`
	AssetID string `json:"assetId,omitempty"`
	JobID   string `json:"jobId,omitempty"`
	Source  string `json:"source"` // upload | ai
	Status  string `json:"status"` // ready | drawing | failed
	Error   string `json:"error,omitempty"`
	Deleted bool   `json:"deleted,omitempty"`
}

type myOutfitView struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	AssetID string `json:"assetId,omitempty"`
	Image   string `json:"image,omitempty"`
	Source  string `json:"source"`
	Status  string `json:"status"`
	Error   string `json:"error,omitempty"`
}

const maxMyOutfits = 60

func (a *Server) myOutfits(w http.ResponseWriter, r *http.Request) {
	ctx, user := r.Context(), identity(r).ID
	page, err := a.Store.RecordPage(ctx, core.RecordQuery{Namespace: "user_outfits", Owner: user, Fields: map[string]string{"deleted": "false"}, Page: 1, Size: maxMyOutfits})
	if err != nil {
		dbError(w, err)
		return
	}
	out := []myOutfitView{}
	for _, row := range page.Items {
		var o myOutfit
		if json.Unmarshal(row.Data, &o) != nil {
			continue
		}
		if o.Status == "drawing" {
			a.settleMyOutfit(ctx, &row, &o)
		}
		v := myOutfitView{ID: row.ID, Title: o.Title, AssetID: o.AssetID, Source: o.Source, Status: o.Status, Error: o.Error}
		if o.AssetID != "" {
			if asset, err := a.Store.Get(ctx, "assets", o.AssetID); err == nil {
				var file struct {
					Key string `json:"key"`
				}
				if json.Unmarshal(asset.Data, &file) == nil {
					v.Image = a.outfitImage(ctx, file.Key)
				}
			}
		}
		out = append(out, v)
	}
	reply(w, 200, map[string]any{"items": out})
}

// settleMyOutfit takes a finished AI job's picture, or its failure.
func (a *Server) settleMyOutfit(ctx context.Context, row *core.Record, o *myOutfit) {
	j, err := a.Store.Job(ctx, o.JobID)
	switch {
	case err != nil:
		o.Status, o.Error = "failed", "生成任务不存在"
	case j.Status == "failed" || j.Status == "cancelled":
		o.Status, o.Error = "failed", j.Error
		if o.Error == "" {
			o.Error = "生成失败"
		}
	case j.Status != "succeeded":
		return
	default:
		refs, _ := core.ResultRefs(j.Result)
		if len(refs) == 0 || !strings.HasPrefix(refs[0], "asset:") {
			o.Status, o.Error = "failed", "生成结果不可用"
			break
		}
		o.AssetID, o.Status = strings.TrimPrefix(refs[0], "asset:"), "ready"
	}
	if saved, err := a.Store.Put(ctx, "user_outfits", core.Record{ID: row.ID, Owner: row.Owner, Data: core.Data(*o)}, row.Version); err == nil {
		*row = saved
	}
}

// addMyOutfit: {asset} (上传, the user's own picture) or {job} (AI生成, the
// user's own image task); title optional.
func (a *Server) addMyOutfit(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Asset string `json:"asset"`
		Job   string `json:"job"`
		Title string `json:"title"`
	}
	if !decode(w, r, &v) {
		return
	}
	ctx, user := r.Context(), identity(r).ID
	v.Title = strings.TrimSpace(v.Title)
	if utf8.RuneCountInString(v.Title) > 20 {
		fail(w, 400, "名称不超过 20 字")
		return
	}
	if count, err := a.Store.RecordPage(ctx, core.RecordQuery{Namespace: "user_outfits", Owner: user, Fields: map[string]string{"deleted": "false"}, Page: 1, Size: 1}); err != nil {
		dbError(w, err)
		return
	} else if count.Total >= maxMyOutfits {
		fail(w, 400, "我的服装最多 60 件，请先删除一些")
		return
	}
	o := myOutfit{Title: v.Title, Status: "ready"}
	switch {
	case v.Asset != "" && v.Job == "":
		if !a.ownImage(ctx, v.Asset, user) {
			fail(w, 400, "图片不可用，请重新上传")
			return
		}
		o.AssetID, o.Source = v.Asset, "upload"
	case v.Job != "" && v.Asset == "":
		j, err := a.Store.Job(ctx, v.Job)
		if err != nil || j.UserID != user || j.Input.Kind != "image" {
			fail(w, 400, "生成任务不可用")
			return
		}
		o.JobID, o.Source, o.Status = j.ID, "ai", "drawing"
	default:
		fail(w, 400, "请上传服装图片或提交 AI 生成")
		return
	}
	if o.Title == "" {
		o.Title = map[string]string{"upload": "我上传的服装", "ai": "AI 生成的服装"}[o.Source]
	}
	row, err := a.Store.Put(ctx, "user_outfits", core.Record{ID: core.NewID(), Owner: user, Data: core.Data(o)}, 0)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 201, map[string]any{"id": row.ID})
}

func (a *Server) deleteMyOutfit(w http.ResponseWriter, r *http.Request) {
	ctx, user := r.Context(), identity(r).ID
	row, err := a.Store.Get(ctx, "user_outfits", r.PathValue("id"))
	var o myOutfit
	if err != nil || row.Owner != user || json.Unmarshal(row.Data, &o) != nil {
		fail(w, 404, "服装不存在")
		return
	}
	o.Deleted = true
	if _, err := a.Store.Put(ctx, "user_outfits", core.Record{ID: row.ID, Owner: user, Data: core.Data(o)}, row.Version); err != nil {
		dbError(w, err)
		return
	}
	w.WriteHeader(204)
}
