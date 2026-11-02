package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"encoding/json"
	"fmt"
)

type Importer struct {
	Service *Service
	Media   *media.Service
}

func (p Importer) Generate(ctx context.Context, j core.Job) (string, error) {
	id := core.Digest(j.ID + ":result")[:32]
	if _, e := p.Service.Store.Get(ctx, "assets", id); e == nil {
		return "asset:" + id, nil
	}
	if !p.Service.Ready() {
		return "", fmt.Errorf("抖音数据接口尚未配置")
	}
	_ = p.Service.Store.Progress(ctx, j, 10, "获取公开视频地址")
	v, e := p.Service.Client.Detail(ctx, j.Input.SourceID)
	if e != nil {
		return "", e
	}
	if v.URL == "" {
		return "", fmt.Errorf("数据源未提供可导入的视频地址")
	}
	_ = p.Service.Store.Progress(ctx, j, 30, "下载视频素材")
	saveJob := j
	saveJob.Input.Kind = "video"
	result, e := p.Media.Save(ctx, saveJob, v.URL)
	if e != nil {
		return "", e
	}
	row, e := p.Service.Store.Get(ctx, "assets", id)
	if e != nil {
		return "", e
	}
	var data map[string]any
	_ = json.Unmarshal(row.Data, &data)
	data["name"] = v.Title
	data["sourceUrl"] = v.SourceURL
	data["sourceVideoId"] = v.ID
	row.Data = core.Data(data)
	if _, e = p.Service.Store.Put(ctx, "assets", row, row.Version); e != nil && e != core.ErrConflict {
		return "", e
	}
	return result, nil
}
