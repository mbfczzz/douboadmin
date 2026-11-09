package api

import (
	"context"
	"doubo/server/internal/audit"
	"doubo/server/internal/core"
	"doubo/server/internal/relay"
	"encoding/json"
	"strings"
)

var kindWords = map[string]string{"image": "图片", "video": "视频", "chat": "对话", "audio": "配音"}

// modelLog records one upstream relay call: who it was for, the redacted
// parameters, status, timing and the (capped) answer. It runs on the job
// worker, not on a user request.
func (a *Server) modelLog(ctx context.Context, c relay.Call) {
	if a.Audit == nil {
		return
	}
	e := core.AuditEntry{
		Category: core.LogModel, ActorType: "system", Method: c.Method,
		Route: "中转 " + c.Method, Path: c.Path, Status: c.Status,
		DurationMs: int(c.Took.Milliseconds()), Action: "调用上游接口",
	}
	switch {
	case c.Method == "POST":
		e.Action = "提交生成"
	case strings.HasPrefix(c.Path, "/v1/tasks/"):
		e.Action = "查询生成结果"
	case c.Path == "/v1/models":
		e.Action = "同步模型目录"
	}
	if j, ok := relay.JobFrom(ctx); ok {
		e.ActorType, e.ActorID = "user", j.User
		e.TargetType, e.TargetID = "job", j.ID
		e.Summary = kindWords[j.Kind] + " · " + a.Audit.Name(ctx, "model", j.Model)
	}
	if c.Body != nil {
		raw, _ := json.Marshal(c.Body)
		e.Request = audit.Body(raw, false)
	}
	e.Response = audit.Body(c.Response, false)
	if c.Err != nil {
		e.Error = c.Err.Error()
	}
	a.Audit.Add(e)
}
