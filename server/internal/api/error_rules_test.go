package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"strings"
	"testing"
)

// An administrator files an upstream failure once; from then on its users
// (and earlier jobs still on screen) read the filed words, never the
// upstream text, while administrators keep the detail. Deleting the rule
// brings back the default.
func TestErrorRulesTellUsersTheFiledWords(t *testing.T) {
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	ctx := context.Background()
	cause := "查询上游任务失败：中转服务 HTTP 502（业务码 5001，task_failed）：video_generation_failed: 本次生成失败：第1个视频素材：画面帧率 120fps 超出范围。已释放原预留款项。"
	j := core.NewJob("user-a", "filed", core.JobInput{Kind: "video", Model: "demo-image", Prompt: "x"})
	if _, err := a.Store.CreateJob(ctx, j); err != nil {
		t.Fatal(err)
	}
	claimed, _ := a.Store.Claim(ctx)
	_, _ = a.Store.Put(ctx, "executions", core.Record{ID: j.ID, Data: core.Data(provider.Execution{Phase: "failed", Error: "生成失败，请查看生成记录或联系管理员。", ErrorCause: cause, ErrorCode: 5001})}, 0)
	if err := a.Store.Finish(ctx, claimed, "", "生成失败，请查看生成记录或联系管理员。"); err != nil {
		t.Fatal(err)
	}
	seen := func() core.Job {
		t.Helper()
		var out core.Job
		_ = json.Unmarshal(call(a, "GET", "/api/jobs/"+j.ID, user, "", nil).Body.Bytes(), &out)
		return out
	}
	if got := seen(); got.Error != "系统异常，生成失败，请稍后重试" {
		t.Fatal("before filing", got.Error)
	}
	for _, bad := range []map[string]string{{"contains": "帧", "message": "参考视频帧率过高"}, {"contains": "帧率", "message": "x"}, {"contains": "帧\n率", "message": "参考视频帧率过高"}} {
		if w := call(a, "POST", "/api/admin/error-rules", admin, "", map[string]any{"data": bad}); w.Code != 400 {
			t.Fatal("invalid rule saved", bad, w.Code)
		}
	}
	w := call(a, "POST", "/api/admin/error-rules", admin, "", map[string]any{"data": map[string]string{"contains": "画面帧率", "message": "参考视频帧率过高", "action": "请换用 24–60 帧的视频后重试。"}})
	var rule core.Record
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &rule) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	got := seen()
	body := string(core.Data(got))
	if got.Error != "参考视频帧率过高" || got.ErrorAction != "请换用 24–60 帧的视频后重试。" || strings.Contains(body, "120fps") || strings.Contains(body, "中转服务") {
		t.Fatal("after filing", got.Error, got.ErrorAction, body)
	}
	if w := call(a, "POST", "/api/admin/error-rules", "", "", map[string]any{}); w.Code != 401 {
		t.Fatal("anonymous", w.Code)
	}
	var detail struct {
		Job         core.Job          `json:"job"`
		PublicError map[string]string `json:"publicError"`
	}
	_ = json.Unmarshal(call(a, "GET", "/api/admin/jobs/"+j.ID+"/detail", admin, "", nil).Body.Bytes(), &detail)
	if detail.PublicError["message"] != "参考视频帧率过高" || detail.Job.Error == "参考视频帧率过高" {
		t.Fatal("admin detail", detail.PublicError, detail.Job.Error)
	}
	if w := call(a, "DELETE", "/api/admin/error-rules/"+rule.ID, admin, "", map[string]any{"version": rule.Version}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if got := seen(); got.Error != "系统异常，生成失败，请稍后重试" {
		t.Fatal("after deleting", got.Error)
	}
	var list []core.Record
	_ = json.Unmarshal(call(a, "GET", "/api/admin/error-rules", admin, "", nil).Body.Bytes(), &list)
	if len(list) != 0 {
		t.Fatal("deleted rule listed", list)
	}
}
