package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"strings"
	"testing"
)

// A user sees the relay's actionable codes in plain words and anything else
// as a system error; an administrator keeps the full detail.
func TestUsersSeeOnlyActionableFailures(t *testing.T) {
	a, _, _ := setup(t)
	user := context.WithValue(t.Context(), identityKey, Identity{ID: "user-a", Role: "user"})
	admin := context.WithValue(t.Context(), identityKey, Identity{ID: "admin-x", Role: "admin"})
	upstream := "查询上游任务失败：中转服务 HTTP 503（业务码 5006，provider_unavailable）：generation_failed: private vendor detail"
	for _, tc := range []struct {
		id, err, action string
		code            int
		want, wantAct   string
	}{
		{"timeout", "生成超时，请先查询原任务结果，避免重复提交。", "保留任务号和幂等键，先查询原任务，勿重复提交。", 5007, "系统异常，生成失败，请稍后重试", ""},
		{"vendor", upstream, "", 0, "系统异常，生成失败，请稍后重试", ""},
		{"safety", "内容未通过安全审核，请调整提示词或参考素材。", "调整提示词或参考素材，不要原样重试。", 5002, "内容未通过安全审核", "请调整提示词"},
		{"copyright", "内容涉及版权限制", "更换为有权使用的素材。", 5009, "内容涉及版权限制", "有权使用"},
		{"reference", "参考素材时长超出限制", "缩短参考素材后提交。", 5101, "参考素材时长超出模型限制", "缩短"},
		// The relay's own text names the cause; the user gets our words only.
		{"relay-text", "video_generation_failed: 本次生成失败：第1个视频素材：素材时长 30.067 秒，要求大于 0 且不超过 30 秒。已释放原预留款项。", "", 5101, "参考素材时长超出模型限制", "缩短"},
		// Only the relay's codes count: words alone are a system error.
		{"text-only", "generation_failed: The generated audio did not pass the content safety review.", "", 0, "系统异常，生成失败，请稍后重试", ""},
	} {
		_, _ = a.Store.Put(t.Context(), "executions", core.Record{ID: tc.id, Data: core.Data(provider.Execution{Phase: "failed", Error: tc.err, ErrorCause: "private cause " + tc.id, ErrorCode: tc.code, ErrorAction: tc.action})}, 0)
		mine := core.Job{ID: tc.id, UserID: "user-a", Status: "failed", Error: tc.err, Input: core.JobInput{Kind: "video", Model: "demo-image", Assets: []string{}}}
		a.presentJob(user, &mine)
		out := string(core.Data(mine))
		if mine.Error != tc.want || !strings.Contains(mine.ErrorAction, tc.wantAct) || mine.ErrorCode != 0 || mine.ErrorType != "" {
			t.Fatal(tc.id, mine.Error, mine.ErrorAction, mine.ErrorCode)
		}
		for _, leak := range []string{"幂等键", "中转服务", "private", "5007", "5006", "HTTP 503", "30.067", "video_generation_failed", "预留款项"} {
			if strings.Contains(out, leak) {
				t.Fatal(tc.id, "leaked", leak, out)
			}
		}
		theirs := core.Job{ID: tc.id, UserID: "user-a", Status: "failed", Error: tc.err, Input: core.JobInput{Kind: "video", Model: "demo-image", Assets: []string{}}}
		a.presentJob(admin, &theirs)
		if theirs.Error != tc.err || theirs.ErrorCode != tc.code {
			t.Fatal(tc.id, "admin lost detail", theirs.Error, theirs.ErrorCode)
		}
	}
	// A failed chat reply (no relay code) is a system error too.
	if got := a.publicMessage(t.Context(), core.Job{ID: "chat-x", Error: "内容未通过安全审核，请换个说法再试", Input: core.JobInput{Kind: "chat"}}); got != "系统异常，回复失败，请稍后重试" {
		t.Fatal(got)
	}
	// A job read straight from the store (我的服装) takes its code from the execution.
	if got := a.publicMessage(t.Context(), core.Job{ID: "safety", Error: "raw", Input: core.JobInput{Kind: "image"}}); got != "内容未通过安全审核" {
		t.Fatal(got)
	}
	// Our own notes (refund, timeout) stay as written.
	timeout := core.Job{Status: "failed", Error: (&core.JobTimeout{Kind: "video"}).Error()}
	publicFailure(&timeout, false)
	if timeout.Error != (&core.JobTimeout{Kind: "video"}).Error() {
		t.Fatal(timeout.Error)
	}
	note := core.Job{Status: "failed", Error: "生成未完成，积分已退回，可重新提交创作"}
	publicFailure(&note, false)
	if note.Error != "生成未完成，积分已退回，可重新提交创作" {
		t.Fatal(note.Error)
	}
}

// A failed job whose points were not returned yet says they will be, instead
// of reading as charged for nothing (and without 预留 / 冻结 wording).
func TestHeldFailureSaysThePointsAreFrozen(t *testing.T) {
	held := core.Job{Status: "failed", BillingState: "reserved", Error: "提交结果待确认", Input: core.JobInput{Kind: "video"}}
	publicFailure(&held, false)
	if held.Error != "系统异常，生成失败，请稍后重试" || held.ErrorAction != heldNote {
		t.Fatal(held.Error, held.ErrorAction)
	}
	released := core.Job{Status: "failed", BillingState: "released", Error: "x", Input: core.JobInput{Kind: "video"}}
	publicFailure(&released, false)
	if released.ErrorAction != "" {
		t.Fatal(released.ErrorAction)
	}
}
