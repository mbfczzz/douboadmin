package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

type musicTrack struct {
	Title     string `json:"title"`
	AssetID   string `json:"assetId"`
	Published bool   `json:"published"`
	Sort      int    `json:"sort"`
	URL       string `json:"url,omitempty"`
}

func (a *Server) music(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "music", "")
	if e != nil {
		dbError(w, e)
		return
	}
	admin := strings.Contains(r.URL.Path, "/admin/")
	out := []core.Record{}
	for _, row := range rows {
		var track musicTrack
		if json.Unmarshal(row.Data, &track) != nil || (!admin && !track.Published) {
			continue
		}
		asset, e := a.Store.Get(r.Context(), "assets", track.AssetID)
		if e != nil {
			continue
		}
		var data struct {
			URL string `json:"url"`
			Key string `json:"key"`
		}
		_ = json.Unmarshal(asset.Data, &data)
		track.URL = data.URL
		if a.Objects != nil {
			track.URL, _ = a.Objects.URL(r.Context(), data.Key)
		}
		row.Data = core.Data(track)
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		var x, y musicTrack
		_ = json.Unmarshal(out[i].Data, &x)
		_ = json.Unmarshal(out[j].Data, &y)
		return x.Sort < y.Sort
	})
	reply(w, 200, out)
}
func (a *Server) saveMusic(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Version int64      `json:"version"`
		Data    musicTrack `json:"data"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Data.Title = strings.TrimSpace(in.Data.Title)
	if in.Data.Title == "" || len([]rune(in.Data.Title)) > 80 || in.Data.Sort < 0 {
		fail(w, 400, "音乐名称或排序无效")
		return
	}
	asset, e := a.Store.Get(r.Context(), "assets", in.Data.AssetID)
	if e != nil || asset.Owner != identity(r).ID {
		fail(w, 400, "请选择管理员上传的音乐文件")
		return
	}
	var data struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(asset.Data, &data)
	if !strings.HasPrefix(data.Type, "audio/") {
		fail(w, 400, "请选择音频文件")
		return
	}
	in.Data.URL = ""
	row, e := a.Store.Put(r.Context(), "music", core.Record{ID: r.PathValue("id"), Owner: identity(r).ID, Data: core.Data(in.Data)}, in.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
