package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"slices"
)

// templateSample: 做同款 from a 创作 preset's 模板案例 fills the editor with
// the template's description and its sample picture as a reference the user
// can replace. The picture becomes the user's own asset for the same file
// (the same one each time), so the job's ownership checks hold.
func (a *Server) templateSample(w http.ResponseWriter, r *http.Request) {
	ctx, user := r.Context(), identity(r).ID
	row, err := a.Store.Get(ctx, "templates", r.PathValue("id"))
	var t core.Template
	if err != nil || json.Unmarshal(row.Data, &t) != nil || t.Kind != "video" || !t.Published || t.Deleted || t.CoverAssetID == "" {
		fail(w, 404, "这个案例没有示例图片")
		return
	}
	cover, err := a.Store.Get(ctx, "assets", t.CoverAssetID)
	var file struct {
		Key  string `json:"key"`
		URL  string `json:"url"`
		Type string `json:"type"`
		Size int64  `json:"size"`
	}
	if err != nil || json.Unmarshal(cover.Data, &file) != nil || file.Key == "" || !slices.Contains([]string{"image/jpeg", "image/png", "image/webp"}, file.Type) {
		fail(w, 404, "这个案例没有示例图片")
		return
	}
	id := core.Digest(user + ":template-sample:" + row.ID + ":" + file.Key)[:32]
	asset, err := a.Store.Get(ctx, "assets", id)
	if err != nil {
		data := map[string]any{"name": t.Title, "url": file.URL, "key": file.Key, "type": file.Type, "size": file.Size}
		asset, err = a.Store.Put(ctx, "assets", core.Record{ID: id, Owner: user, Data: core.Data(data)}, 0)
		if err == core.ErrConflict {
			asset, err = a.Store.Get(ctx, "assets", id)
		}
	}
	if err == nil {
		asset, err = a.signedAsset(ctx, asset)
	}
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, asset)
}
