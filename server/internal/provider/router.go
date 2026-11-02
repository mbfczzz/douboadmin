package provider

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
)

type Router struct {
	AI     Provider
	Import Provider
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
	return p.AI.Generate(ctx, j)
}
