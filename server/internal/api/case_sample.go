package api

import (
	"doubo/server/internal/core"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

// caseSample: 做同款 on a built-in 剧情带货 / 探店 案例 puts the case's product
// or store photo (media/ui-art/case-*.jpg, drawn with Codex) into the editor
// as the user's own picture (the same asset each time), so they can generate
// at once or replace it. With OSS it points at the synced UI art object.
var caseName = regexp.MustCompile(`^case-(ad|shop)-[a-z0-9]{1,20}$`)

func (a *Server) caseSample(w http.ResponseWriter, r *http.Request) {
	ctx, user, name := r.Context(), identity(r).ID, r.PathValue("name")
	file := filepath.Join(a.Config.MediaDir, "ui-art", name+".jpg")
	info, err := os.Stat(file)
	if !caseName.MatchString(name) || err != nil {
		fail(w, 404, "这个案例没有示例图片")
		return
	}
	key, url := "ui-art/"+name+".jpg", "/media/ui-art/"+name+".jpg"
	if a.Objects != nil {
		if a.Media == nil || a.Media.UIArt == nil || a.Media.UIArt.Key(url) == "" {
			fail(w, 503, "示例图片还在准备，请稍后再试")
			return
		}
		key, url = a.Media.UIArt.Key(url), ""
	}
	id := core.Digest(user + ":case-sample:" + key)[:32]
	asset, err := a.Store.Get(ctx, "assets", id)
	if err != nil {
		data := map[string]any{"name": name, "url": url, "key": key, "type": "image/jpeg", "size": info.Size()}
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
