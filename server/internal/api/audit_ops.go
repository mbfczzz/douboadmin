package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// op names a route for the business log: what was done and to what.
type op struct {
	label, target string // target: kind of the {id} path value
	creates       string // kind of the record a POST creates (id from the reply)
	summary       func(req, resp map[string]any) string
}

func str(m map[string]any, k string) string {
	if v, ok := m[k]; ok && v != nil {
		return strings.TrimSpace(fmt.Sprint(v))
	}
	return ""
}

func num(m map[string]any, k string) float64 {
	f, _ := m[k].(float64)
	return f
}

func reason(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v := str(m, k); v != "" {
			return "（" + short(v, 60) + "）"
		}
	}
	return ""
}

func short(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

var statusWords = map[string]string{"active": "恢复", "disabled": "停用", "unbound": "解绑", "paid": "确认打款", "cancelled": "取消提现", "approved": "通过", "rejected": "驳回"}

var ops = map[string]op{
	"POST /api/admin/login":      {label: "管理员登录"},
	"POST /api/auth/logout":      {label: "退出登录"},
	"POST /api/auth/login":       {label: "用户登录（演示）"},
	"POST /api/auth/wechat":      {label: "用户微信登录"},
	"PUT /api/admin/me/password": {label: "修改本人密码"},
	"POST /api/admin/accounts": {creates: "admin", label: "创建管理账号", summary: func(q, _ map[string]any) string {
		return "账号 " + str(q, "username") + " · 角色 " + str(q, "role")
	}},
	"PUT /api/admin/accounts/{id}": {label: "修改管理账号", target: "admin", summary: func(q, _ map[string]any) string {
		return "角色 " + str(q, "role") + map[bool]string{true: " · 停用", false: ""}[q["disabled"] == true]
	}},
	"PUT /api/admin/accounts/{id}/password": {label: "重置管理账号密码", target: "admin"},
	"DELETE /api/admin/accounts/{id}":       {label: "归档管理账号", target: "admin"},
	"POST /api/admin/roles":                 {creates: "role", label: "创建角色", summary: func(q, _ map[string]any) string { return str(q, "name") }},
	"PUT /api/admin/roles/{id}":             {label: "修改角色", target: "role", summary: func(q, _ map[string]any) string { return str(q, "name") }},
	"DELETE /api/admin/roles/{id}":          {label: "删除角色", target: "role"},
	"PUT /api/admin/users/{id}":             {label: "编辑用户资料", target: "user"},
	"PUT /api/admin/users/{id}/status": {label: "修改用户状态", target: "user", summary: func(q, _ map[string]any) string {
		return map[bool]string{true: "停用", false: "启用"}[q["disabled"] == true] + reason(q, "reason")
	}},
	"DELETE /api/admin/users/{id}":                        {label: "归档用户", target: "user", summary: func(q, _ map[string]any) string { return reason(q, "reason") }},
	"POST /api/admin/users/{id}/wallet":                   {label: "调整用户积分", target: "user", summary: pointsSummary},
	"PUT /api/admin/models/{id}":                          {label: "修改模型配置", target: "model"},
	"POST /api/admin/models":                              {creates: "model", label: "添加模型", summary: func(q, _ map[string]any) string { return str(q, "key") }},
	"POST /api/admin/models/sync":                         {label: "同步上游模型"},
	"DELETE /api/admin/models/{id}":                       {label: "删除模型", target: "model"},
	"PUT /api/admin/templates/{id}":                       {label: "保存模板", target: "template"},
	"DELETE /api/admin/templates/{id}":                    {label: "删除模板", target: "template"},
	"POST /api/admin/assets":                              {label: "上传素材"},
	"DELETE /api/admin/works/{id}":                        {label: "删除作品", target: "job"},
	"POST /api/admin/jobs":                                {creates: "job", label: "后台提交生成任务"},
	"POST /api/admin/jobs/{id}/release":                   {label: "核实后退回积分", target: "job", summary: func(q, _ map[string]any) string { return reason(q, "reason") }},
	"POST /api/admin/jobs/{id}/resume":                    {label: "恢复任务查询", target: "job"},
	"POST /api/admin/orders/{id}/refund":                  {label: "订单退款", target: "order", summary: func(q, _ map[string]any) string { return reason(q, "reason") }},
	"POST /api/admin/orders/{id}/refresh":                 {label: "订单查单", target: "order"},
	"POST /api/admin/refunds/{id}/refresh":                {label: "退款查单", target: "refund"},
	"POST /api/admin/virtual-payments/events/{id}/retry":  {label: "重试虚拟支付通知", target: "event"},
	"POST /api/admin/virtual-payments/events/{id}/review": {label: "人工核对虚拟支付", target: "event", summary: func(q, _ map[string]any) string { return reason(q, "note") }},
	"PUT /api/admin/platform":                             {label: "修改平台设置"},
	"PUT /api/admin/integrations/{group}":                 {label: "修改服务接入配置", target: "group"},
	"PUT /api/admin/alerts/{id}/ack":                      {label: "确认告警", target: "alert"},
	"POST /api/admin/partners": {creates: "partner", label: "创建服务商", summary: func(q, _ map[string]any) string {
		return str(q, "name") + fmt.Sprintf(" · 初始名额 %.0f", num(q, "users"))
	}},
	"PUT /api/admin/partners/{id}":         {label: "编辑服务商", target: "partner"},
	"PUT /api/admin/partners/{id}/account": {label: "修改服务商登录账号", target: "partner", summary: accountSummary},
	"PUT /api/admin/partner-policy":        {label: "修改分销规则"},
	"POST /api/admin/quota-moves": {label: "名额划拨", summary: func(q, _ map[string]any) string {
		return map[bool]string{true: "收回", false: "划拨"}[str(q, "kind") == "reclaim"] + fmt.Sprintf(" %.0f 个名额", num(q, "users")) + reason(q, "reason")
	}},
	"POST /api/admin/quota-requests": {creates: "request", label: "申请名额", summary: func(q, _ map[string]any) string {
		return fmt.Sprintf("%.0f 个名额", num(q, "users")) + reason(q, "reason")
	}},
	"PUT /api/admin/quota-requests/{id}": {label: "审批名额申请", target: "request", summary: func(q, _ map[string]any) string {
		return map[bool]string{true: "批准", false: "拒绝"}[q["approve"] == true] + reason(q, "reason")
	}},
	"POST /api/admin/activation-codes":        {creates: "code", label: "生成授权码", summary: func(q, _ map[string]any) string { return str(q, "label") }},
	"DELETE /api/admin/activation-codes/{id}": {label: "撤销授权码", target: "code"},
	"PUT /api/admin/memberships/{id}":         {label: "修改用户授权", target: "user", summary: func(q, _ map[string]any) string { return statusWords[str(q, "status")] + reason(q, "reason") }},
	"POST /api/admin/commission-payouts": {creates: "payout", label: "申请提现", summary: func(q, _ map[string]any) string {
		return fmt.Sprintf("¥%.2f", num(q, "amountFen")/100) + reason(q, "note")
	}},
	"PUT /api/admin/commission-payouts/{id}": {label: "处理提现", target: "payout", summary: func(q, _ map[string]any) string { return statusWords[str(q, "status")] + reason(q, "reference") }},
	"POST /api/access/sms":                   {label: "发送短信验证码", summary: func(q, _ map[string]any) string { return "手机号 " + str(q, "phone") }},
	"POST /api/access/profile":               {label: "完善注册信息", summary: func(q, _ map[string]any) string { return str(q, "name") + " · " + str(q, "phone") }},
	"PUT /api/admin/signup": {label: "设置普通用户注册", summary: func(q, _ map[string]any) string {
		return map[bool]string{true: "开放", false: "关闭"}[q["openSignup"] == true]
	}},
	"POST /api/access/direct":          {label: "跳过激活，以普通用户开通"},
	"POST /api/access/redeem":          {label: "使用授权码激活"},
	"PUT /api/me":                      {label: "修改个人资料"},
	"PUT /api/preferences":             {label: "修改偏好设置"},
	"POST /api/assets":                 {label: "上传素材"},
	"POST /api/jobs":                   {creates: "job", label: "提交生成任务", summary: jobSummary},
	"POST /api/jobs/{id}/retry":        {label: "重试生成任务", target: "job"},
	"POST /api/hot/videos/{id}/import": {label: "导入热门视频", target: "video"},
	"DELETE /api/works/{id}":           {label: "删除作品", target: "job"},
	"POST /api/shares":                 {label: "创建分享"},
	"PUT /api/favorites/{id}": {label: "收藏模板", target: "template", summary: func(q, _ map[string]any) string {
		return map[bool]string{true: "收藏", false: "取消收藏"}[q["active"] == true]
	}},
	"POST /api/feedback":                      {label: "提交反馈"},
	"POST /api/orders":                        {creates: "order", label: "创建充值订单"},
	"POST /api/orders/{id}/pay":               {label: "发起支付", target: "order"},
	"POST /api/payments/wechat/notify":        {label: "微信支付回调"},
	"POST /api/payments/wechat/refund-notify": {label: "微信退款回调"},
	"POST /api/payments/virtual/notify":       {label: "虚拟支付回调"},
}

func pointsSummary(q, _ map[string]any) string {
	units := num(q, "units") / 100
	verb := "增加"
	if units < 0 {
		verb, units = "扣减", -units
	}
	return fmt.Sprintf("%s %g 积分", verb, units) + reason(q, "note")
}

func accountSummary(q, _ map[string]any) string {
	parts := []string{"角色 " + str(q, "role")}
	if q["disabled"] == true {
		parts = append(parts, "停用登录")
	}
	if str(q, "password") != "" {
		parts = append(parts, "重置密码")
	}
	if str(q, "username") != "" {
		parts = append(parts, "开通账号 "+str(q, "username"))
	}
	return strings.Join(parts, " · ")
}

func jobSummary(q, _ map[string]any) string {
	return kindWords[str(q, "kind")] + " · " + short(str(q, "prompt"), 40)
}

func object(s string) map[string]any {
	var m map[string]any
	_ = json.Unmarshal([]byte(s), &m)
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// describe fills category, action, target and summary from the route table.
func describe(r *http.Request, info *auditInfo, e *core.AuditEntry) {
	o, known := ops[r.Pattern]
	if !known {
		e.Action = reads[r.Pattern]
		return
	}
	req, resp := object(e.Request), object(e.Response)
	e.Category, e.Action = core.LogBusiness, o.label
	if strings.Contains(r.Pattern, "/login") || strings.Contains(r.Pattern, "/logout") || strings.Contains(r.Pattern, "/auth/") {
		e.Category = core.LogAuth
		loginActor(r, req, resp, e)
	}
	if o.target != "" {
		e.TargetType = o.target
		if id := r.PathValue("id"); id != "" {
			e.TargetID = id
		} else {
			e.TargetID = r.PathValue("group")
		}
	} else if id := createdID(resp); id != "" && o.creates != "" {
		e.TargetType, e.TargetID = o.creates, id
	}
	if info.targetID != "" {
		e.TargetType, e.TargetID = info.targetType, info.targetID
	}
	if o.summary != nil && e.Status < 400 {
		e.Summary = o.summary(req, resp)
	}
	if info.detail != "" {
		e.Summary = strings.TrimSpace(e.Summary + " " + info.detail)
	}
	if e.Status >= 400 {
		e.Error = str(resp, "error")
	}
}

func createdID(resp map[string]any) string {
	if id := str(resp, "id"); id != "" {
		return id
	}
	for _, k := range []string{"record", "account", "job"} {
		if m, ok := resp[k].(map[string]any); ok {
			return str(m, "id")
		}
	}
	return ""
}

// loginActor attributes sign-ins: the account name typed, or the user id
// the server answered with.
func loginActor(r *http.Request, req, resp map[string]any, e *core.AuditEntry) {
	if e.ActorID != "" {
		return
	}
	if r.Pattern == "POST /api/admin/login" {
		e.ActorType, e.ActorName = "admin", str(req, "username")
		return
	}
	if id := str(resp, "userId"); id != "" {
		e.ActorType, e.ActorID = "user", id
	}
}
