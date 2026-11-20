package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"slices"
)

// 后台 → 试衣服装: the AI试衣 clothing library.

type adminOutfit struct {
	ID      string      `json:"id"`
	Version int64       `json:"version"`
	Data    core.Outfit `json:"data"`
	Image   string      `json:"image"`
}

func (a *Server) adminOutfits(w http.ResponseWriter, r *http.Request) {
	q, ok := listQuery(w, r, "outfits")
	if !ok {
		return
	}
	q.Fields["deleted"] = "false"
	q.SortField = "sort"
	if c := r.URL.Query().Get("category"); c != "" {
		q.Fields["category"] = c
	}
	if s := r.URL.Query().Get("status"); s == "published" || s == "draft" {
		q.Fields["published"] = map[bool]string{true: "true", false: "false"}[s == "published"]
	}
	page, err := a.Store.RecordPage(r.Context(), q)
	if err != nil {
		dbError(w, err)
		return
	}
	items := []adminOutfit{}
	for _, row := range page.Items {
		var o core.Outfit
		if json.Unmarshal(row.Data, &o) == nil {
			items = append(items, adminOutfit{row.ID, row.Version, o, a.outfitImage(r.Context(), o.ImageKey)})
		}
	}
	if !r.URL.Query().Has("page") {
		reply(w, 200, items)
		return
	}
	reply(w, 200, map[string]any{"items": items, "page": page.Page, "size": page.Size, "total": page.Total})
}

func (a *Server) saveOutfit(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64       `json:"version"`
		Data    core.Outfit `json:"data"`
	}
	if !decode(w, r, &v) {
		return
	}
	o, id := v.Data, r.PathValue("id")
	if len(id) == 0 || len(id) > 64 {
		fail(w, 400, "服装标识无效")
		return
	}
	if err := o.Clean(); err != nil {
		fail(w, 400, err.Error())
		return
	}
	asset, err := a.Store.Get(r.Context(), "assets", o.ImageAssetID)
	var file struct {
		Key  string `json:"key"`
		Type string `json:"type"`
		Size int64  `json:"size"`
	}
	if err != nil || !a.adminAsset(r, asset.Owner) || json.Unmarshal(asset.Data, &file) != nil || file.Key == "" {
		fail(w, 400, "服装图片不可用，请重新上传")
		return
	}
	if !slices.Contains([]string{"image/jpeg", "image/png", "image/webp"}, file.Type) {
		fail(w, 400, "服装图片仅支持 JPG、PNG 和 WebP")
		return
	}
	o.ImageKey, o.ImageType, o.ImageSize, o.Deleted = file.Key, file.Type, file.Size, false
	row, err := a.Store.Put(r.Context(), "outfits", core.Record{ID: id, Data: core.Data(o)}, v.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, adminOutfit{row.ID, row.Version, o, a.outfitImage(r.Context(), o.ImageKey)})
}
