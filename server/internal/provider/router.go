package provider

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
)

type Router struct {
	AI     Provider
	Import Provider
	Chat   *DirectChat // DeepSeek / 豆包 called directly; nil when not set up
	// Seedance at 火山方舟 (the fixed arkvideo: models); nil when not set up.
	ArkVideo *ArkVideo
}

func (p Router) Generate(ctx context.Context, j core.Job) (string, error) {
	if j.Input.Kind == "import" {
		if p.Import == nil {
			return "", fmt.Errorf("素材导入服务尚未配置")
		}
		return p.Import.Generate(ctx, j)
	}
	if !core.IsGeneration(j.Input.Kind) {
		return "", fmt.Errorf("该任务类型已停止支持")
	}
	if ark, err := p.ArkVideo.Route(ctx, j); err != nil {
		return "", ErrPending
	} else if ark {
		return p.ArkVideo.Generate(ctx, j)
	}
	if p.Chat.Handles(ctx, j) {
		return p.Chat.Generate(ctx, j)
	}
	return p.AI.Generate(ctx, j)
}
