package provider

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
)

type Router struct {
	AI     Provider
	Mix    Provider
	Import Provider
}

func (p Router) Generate(ctx context.Context, j core.Job) (string, error) {
	if j.Input.Kind == "import" {
		if p.Import == nil {
			return "", fmt.Errorf("素材导入服务尚未配置")
		}
		return p.Import.Generate(ctx, j)
	}
	if j.Input.Kind == "mix" {
		if p.Mix == nil {
			return "", fmt.Errorf("混剪服务尚未配置")
		}
		return p.Mix.Generate(ctx, j)
	}
	return p.AI.Generate(ctx, j)
}
