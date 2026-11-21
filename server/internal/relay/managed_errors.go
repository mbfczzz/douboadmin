package relay

import (
	"encoding/json"
	"strconv"
	"strings"
)

// ManagedError is the stable customer-facing error contract documented by the
// Managed layer. Message is operator detail; UserMessage is safe for clients.
type ManagedError struct {
	Code         int
	Type         string
	Message      string
	UserMessage  string
	Action       string
	UpstreamCode string
	UpstreamType string
	Retryable    bool
	Editable     bool
	Definitive   bool
}

type managedRule struct {
	typ, message, action  string
	retryable, definitive bool
}

var managedRules = map[int]managedRule{
	4001: {"invalid_api_key", "API Key 无效或已停用，请检查后重试。", "检查服务接入配置；仍失败请联系管理员。", false, true},
	4003: {"forbidden", "没有访问权限，请联系管理员。", "核对账号、模型和资源访问权限。", false, true},
	4004: {"not_found", "模型、任务或接口不存在，请检查请求信息。", "检查模型、任务编号和接口路径。", false, true},
	4009: {"conflict", "请求状态或幂等键冲突，请核对原请求。", "保留原幂等键，查询原任务或核对请求内容。", false, true},
	4013: {"request_too_large", "请求体过大，请缩小请求或使用素材直链。", "缩小请求，或改用素材文件直链。", false, true},
	5001: {"task_failed", "生成失败，请查看生成记录或联系管理员。", "保留任务号，联系管理员核对；确认可重试后再提交。", true, true},
	5002: {"safety_policy", "内容未通过安全审核，请调整提示词或参考素材。", "调整提示词或参考素材，不要原样重试。", false, true},
	5003: {"invalid_input", "请求参数不符合模型要求，请检查后重试。", "修改参数后重新提交。", false, true},
	5004: {"insufficient_balance", "可用积分不足，请充值或联系管理员。", "补充积分后再提交。", false, true},
	5005: {"concurrency_limit", "进行中的任务过多，请等待任务结束后再提交。", "等待现有任务结束后再试。", true, true},
	5006: {"provider_unavailable", "当前模型暂不可用，请稍后再试。", "稍后重试；已有任务号时只查询原任务。", true, true},
	5007: {"generation_timeout", "生成超时，请先查询原任务结果，避免重复提交。", "保留任务号和幂等键，先查询原任务，勿重复提交。", false, false},
	5008: {"upstream_rate_limited", "请求过于频繁，请稍后再试。", "稍后重试，避免密集提交。", true, true},
	5009: {"copyright_restriction", "内容涉及版权限制，请调整提示词或更换素材。", "更换为有权使用的素材。", false, true},
	5010: {"result_archive_failed", "生成结果保存失败，请联系管理员，勿重新生成。", "联系管理员恢复归档，不要重新生成。", false, true},
	5011: {"submission_outcome_unknown", "提交结果待确认，请查询原任务或联系管理员，勿重复提交。", "保留原任务号和幂等键，禁止换键盲目重发。", false, false},
	5012: {"internal_error", "服务暂时异常，请联系管理员核对。", "保留请求信息并联系管理员。", false, true},
	5013: {"task_cancelled", "任务已取消。", "需要重新生成时，请显式创建新任务。", true, true},
	5101: {"reference_duration_exceeded", "参考素材时长超出限制，请缩短后重新上传。", "缩短参考素材后提交。", false, true},
	5102: {"reference_format_unsupported", "参考素材格式不受支持，请按模型要求上传。", "按模型要求转换格式。", false, true},
	5103: {"reference_stream_invalid", "参考音视频无法解析，请重新编码或更换文件。", "重新编码或更换文件。", false, true},
	5104: {"reference_aspect_invalid", "参考图片宽高比超出限制，请裁剪或更换图片。", "裁剪或更换图片。", false, true},
	5201: {"upstream_quota_insufficient", "上游生成渠道额度不足，请联系管理员。", "联系管理员补充上游渠道额度，无需自行充值。", false, true},
	5202: {"upstream_network_error", "上游网络异常，请先查询原任务结果，避免重复提交。", "先查询原任务，保留任务号和幂等键，勿重复提交。", false, false},
}

var managedEditable = map[int]bool{
	4013: true, 5001: true, 5002: true, 5003: true, 5005: true, 5006: true,
	5008: true, 5009: true, 5013: true, 5101: true, 5102: true, 5103: true, 5104: true,
}

func scalar(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		return ""
	}
}

func clipManaged(value string, limit int) string {
	value = strings.TrimSpace(value)
	if runes := []rune(value); len(runes) > limit {
		return string(runes[:limit])
	}
	return value
}

// ParseManagedError accepts either the whole {error:{...}} response or the
// nested error object. Unknown codes remain operator-only and get no user text.
func ParseManagedError(raw []byte) ManagedError {
	var envelope struct {
		Error json.RawMessage `json:"error"`
	}
	if json.Unmarshal(raw, &envelope) == nil && len(envelope.Error) > 0 {
		raw = envelope.Error
	}
	var data struct {
		Code         json.RawMessage `json:"code"`
		Type         string          `json:"type"`
		Message      string          `json:"message"`
		UserMessage  string          `json:"user_message"`
		UpstreamCode json.RawMessage `json:"upstream_code"`
		UpstreamType string          `json:"upstream_type"`
	}
	if json.Unmarshal(raw, &data) != nil {
		return ManagedError{}
	}
	code, _ := strconv.Atoi(scalar(data.Code))
	code = settledCode(code, data.Message)
	out := ManagedError{Code: code, Message: clipManaged(data.Message, 500), UpstreamCode: clipManaged(scalar(data.UpstreamCode), 100), UpstreamType: clipManaged(data.UpstreamType, 100)}
	if rule, ok := managedRules[code]; ok {
		out.Type, out.UserMessage, out.Action = rule.typ, rule.message, rule.action
		out.Retryable, out.Definitive = rule.retryable, rule.definitive
		out.Editable = managedEditable[code]
		if data.Type == rule.typ && strings.TrimSpace(data.UserMessage) != "" {
			out.UserMessage = clipManaged(data.UserMessage, 200)
		}
	}
	return out
}

// settledCode: a generic "unavailable / internal / network" code whose own
// message says the generation already ended (failed, or blocked by content
// review) is that ending. The relay has labelled a finished task's content
// review failure as 5006 provider_unavailable, which kept a finished task
// being queried as if the model were only down for a moment.
func settledCode(code int, message string) int {
	if code != 5006 && code != 5012 && code != 5202 {
		return code
	}
	m := strings.ToLower(message)
	switch {
	case strings.Contains(m, "safety review") || strings.Contains(m, "content safety") || strings.Contains(m, "安全审核"):
		return 5002
	case strings.Contains(m, "generation_failed"):
		return 5001
	}
	return code
}
