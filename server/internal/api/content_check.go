package api

import (
	"cmp"
	"context"
	"doubo/server/internal/audit"
	"doubo/server/internal/core"
	"doubo/server/internal/wechat"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// 内容安全: what mini-program users write and upload is judged by WeChat
// (security.msgSecCheck / mediaCheckAsync). Risky text is refused at once;
// a file is judged after it is saved (content_media.go): a risky upload can
// no longer be used, a risky work is shown to no one else. A check that
// cannot be made lets the content through (it is logged): a WeChat outage
// does not stop creating. Every call and result is in 日志管理 → 内容安全.

const unsafeText = "内容可能含有违规信息，请修改后重试"

// Text goes to WeChat in pieces of this many characters, at most this many
// pieces (a long 一键复刻 description starts with what the user wrote).
const (
	secPiece  = 2500
	secPieces = 4
)

func (a *Server) secReady() bool {
	return a.WeChat != nil && a.WeChat.AppID != "" && a.WeChat.Secret != ""
}

// secOpenID: the user's openid at this mini-program; "" for one who never
// signed in with WeChat (nothing to check with).
func (a *Server) secOpenID(ctx context.Context, id Identity) string {
	if id.WeChatOpenID != "" {
		return id.WeChatOpenID
	}
	row, e := a.Store.Get(ctx, "wechat_identities", id.ID)
	if e != nil {
		return ""
	}
	var v struct {
		OpenID string `json:"openid"`
	}
	_ = json.Unmarshal(row.Data, &v)
	return v.OpenID
}

// textRisky: WeChat finds one of texts risky (a review verdict passes and
// stays in the log for a person to look at).
func (a *Server) textRisky(r *http.Request, scene int, texts ...string) bool {
	id := identity(r)
	if !a.secReady() || id.Role != "user" {
		return false
	}
	openid := a.secOpenID(r.Context(), id)
	if openid == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	for _, text := range texts {
		for _, part := range pieces(strings.TrimSpace(text), secPiece, secPieces) {
			v, call, err := a.WeChat.MsgSecCheck(ctx, openid, scene, part)
			a.secLog(id.ID, "文本内容安全检测", "", "", call, v, err, "已拦截「"+cmp.Or(ops[r.Pattern].label, r.Pattern)+"」")
			if err == nil && v.Suggest == "risky" {
				return true
			}
		}
	}
	return false
}

func pieces(text string, size, most int) []string {
	r := []rune(text)
	var out []string
	for len(r) > 0 && len(out) < most {
		n := min(size, len(r))
		out = append(out, string(r[:n]))
		r = r[n:]
	}
	return out
}

// secLog writes one call to WeChat (its answer as given) to 日志管理. A
// risky verdict shows as failed, with what was done about it (blocked).
func (a *Server) secLog(user, action, targetType, targetID string, call wechat.SecCall, v wechat.Verdict, err error, blocked string) {
	if a.Audit == nil {
		return
	}
	e := core.AuditEntry{
		Category: core.LogSecurity, ActorType: "user", ActorID: user, Action: action,
		Method: "POST", Route: "微信内容安全 " + call.Path, Path: call.Path, Status: 200,
		DurationMs: int(call.Took.Milliseconds()), TargetType: targetType, TargetID: targetID,
		Summary: verdictWords(v),
	}
	if user == "" {
		e.ActorType = "system"
	}
	if call.Request != nil {
		raw, _ := json.Marshal(call.Request)
		e.Request = audit.Body(raw, false)
	}
	e.Response = audit.Body(call.Response, false)
	if err != nil {
		e.Status, e.Error = 502, err.Error()
	} else if v.Suggest == "risky" {
		e.Error = "微信判定违规（" + secReason(v) + "），" + blocked
	}
	a.Audit.Add(e)
}

// WeChat's labels (version 2).
var secLabels = map[int]string{
	100: "正常", 10001: "广告", 20001: "时政", 20002: "色情", 20003: "辱骂",
	20006: "违法犯罪", 20008: "欺诈", 20012: "低俗", 20013: "版权", 21000: "其他",
}

// secReason: WeChat's label for a risky verdict.
func secReason(v wechat.Verdict) string {
	if label := secLabels[v.Label]; label != "" && v.Label != 100 {
		return label
	}
	return "违规"
}

func verdictWords(v wechat.Verdict) string {
	words := map[string]string{"pass": "通过", "review": "疑似，待人工复查", "risky": "违规"}[v.Suggest]
	if words == "" {
		return ""
	}
	if label := secLabels[v.Label]; label != "" && v.Label != 100 {
		words += " · " + label
	}
	return words
}
