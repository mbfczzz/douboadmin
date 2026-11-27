package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"strings"
)

// What a user (not an administrator) sees of a failed job: only the relay's
// own codes for what the user can act on (content review 5002, copyright
// 5009, a parameter or material the model cannot take 5003 / 5101–5104),
// each in fixed words. Anything else, and any failure without such a code,
// is a system error. Upstream text, codes and operator guidance (task ids,
// idempotency keys, channels) stay in the admin console.

type userFailure struct{ message, action string }

var (
	failSafety    = userFailure{"内容未通过安全审核", "请调整提示词或参考素材后再试。"}
	failCopyright = userFailure{"内容涉及版权限制", "请更换为有权使用的素材后再试。"}
	failSystem    = userFailure{"系统异常，生成失败，请稍后重试", ""}
	failRoute     = userFailure{"当前模型不支持这组参数或素材", "请更换模型或调整规格后再试。"}
	failInput     = userFailure{"当前模型不支持这组参数或素材", "请调整参数或参考素材后再试。"}
	failChat      = userFailure{"系统异常，回复失败，请稍后重试", ""}
)

// Reference material problems the user can fix (relay codes 5101–5104).
var failReference = map[int]userFailure{
	5101: {"参考素材时长超出模型限制", "请缩短参考素材后重新上传。"},
	5102: {"参考素材格式不受支持", "请按模型要求的格式重新上传。"},
	5103: {"参考音视频无法解析", "请重新导出或更换文件后再试。"},
	5104: {"参考图片的宽高比超出限制", "请裁剪或更换图片后再试。"},
}

// Kept as written: our own outcome notes, not upstream detail.
var keptNotes = []string{"生成未完成，积分已退回",
	(&core.JobTimeout{Kind: "image"}).Error(), (&core.JobTimeout{Kind: "video"}).Error()}

// action: the guidance shown so far (presentJob marks a missing route there).
func failureFor(code int, action, kind string) userFailure {
	switch code {
	case 5002:
		return failSafety
	case 5009:
		return failCopyright
	case 5003:
		if strings.Contains(action, "更换模型") {
			return failRoute
		}
		return failInput
	}
	if f, ok := failReference[code]; ok {
		return f
	}
	if kind == "chat" {
		return failChat
	}
	return failSystem
}

// A failed job whose points were not returned automatically: the upstream
// outcome was not confirmed, so an administrator verifies it and returns them
// (后台 → 退回积分). Users are told plainly, in the 提交扣除 / 失败退回 terms they
// know: no 预留 / 冻结 wording (commit a1725b2).
const heldNote = "积分将在平台核实后退回，无需重复提交。"

// publicFailure rewrites a failed job for its owner's eyes; hinted: the
// message is the operator's own (模型配置 → 错误提示), kept as written.
func publicFailure(j *core.Job, hinted bool) {
	if j.Status != "failed" {
		return
	}
	defer func() {
		if j.BillingState == "reserved" {
			j.ErrorAction = heldNote
		}
	}()
	if hinted { // keep the operator's wording; guidance by category, not upstream's
		j.ErrorAction = failureFor(j.ErrorCode, j.ErrorAction, j.Input.Kind).action
		j.ErrorCode, j.ErrorType = 0, ""
		return
	}
	for _, note := range keptNotes {
		if strings.HasPrefix(j.Error, note) {
			j.ErrorCode, j.ErrorType, j.ErrorAction = 0, "", ""
			return
		}
	}
	f := failureFor(j.ErrorCode, j.ErrorAction, j.Input.Kind)
	j.Error, j.ErrorAction = f.message, f.action
	j.ErrorCode, j.ErrorType = 0, ""
}

// publicMessage is the user's text for a failed job read from the store,
// with the relay code from its execution record.
func (a *Server) publicMessage(ctx context.Context, j core.Job) string {
	j.Status = "failed"
	if row, err := a.Store.Get(ctx, "executions", j.ID); err == nil {
		var e provider.Execution
		if json.Unmarshal(row.Data, &e) == nil {
			j.ErrorCode, j.ErrorAction = e.ErrorCode, e.ErrorAction
			if rule, ok := a.matchErrorRule(ctx, e.ErrorCause, j.Error); ok && e.ErrorCause != "" {
				return rule.Message // 错误归档 (error_rules.go)
			}
		}
	}
	publicFailure(&j, false)
	return j.Error
}

// isAdmin: administrators keep the full failure detail.
func isAdmin(ctx context.Context) bool {
	actor, ok := ctx.Value(identityKey).(Identity)
	return ok && actor.Role == "admin"
}
