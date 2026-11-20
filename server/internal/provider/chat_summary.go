package provider

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
)

// Long conversations: once more than historyTurns+2 turns (or more than
// historyRunes characters) follow the summary, all but the last 4 are folded
// into it, so the model keeps what was decided without reading it again.
const keepAfterFold = 4

const summarySystem = "你负责为创作助手压缩对话记录。把已有摘要和新增对话合并成一份不超过 300 字的中文摘要：" +
	"保留用户确定的需求、风格、时长比例、素材用法、已出方案的标题与关键参数、被否定的方向和尚未解决的问题；不写客套话，不编造。只输出摘要正文。"

func foldTurns(ctx context.Context, s store.Store, session *sessionRow, turns []core.Job, summarize Summarizer) []core.Job {
	after := turns[:0:0]
	for _, t := range turns {
		if t.CreatedAt.UnixNano() > session.SummaryUntil {
			after = append(after, t)
		}
	}
	size := 0
	for _, t := range after {
		size += len([]rune(t.Input.Prompt)) + len([]rune(t.Result))
	}
	if summarize == nil || len(after) <= keepAfterFold || len(after) <= historyTurns+2 && size <= historyRunes {
		return after
	}
	fold, rest := after[:len(after)-keepAfterFold], after[len(after)-keepAfterFold:]
	text, err := summarize(ctx, summaryInput(session.Summary, trim(fold, 2000, 0)))
	if err != nil || strings.TrimSpace(text) == "" {
		slog.Warn("chat summary failed", "session", session.row.ID, "error", err)
		return after // sent as before; trimmed to the latest turns
	}
	session.Summary, session.SummaryUntil = strings.TrimSpace(text), fold[len(fold)-1].CreatedAt.UnixNano()
	// Kept for the next turns. Each new message also touches the project
	// (its version moves), so a conflict is retried once on a fresh read.
	row := session.row
	row.Data = core.Data(session.AgentSession)
	if _, err = s.Put(ctx, "agent_sessions", row, row.Version); errors.Is(err, core.ErrConflict) {
		var fresh core.AgentSession
		if row, err = s.Get(ctx, "agent_sessions", row.ID); err == nil && json.Unmarshal(row.Data, &fresh) == nil {
			fresh.Summary, fresh.SummaryUntil = session.Summary, session.SummaryUntil
			row.Data = core.Data(fresh)
			_, err = s.Put(ctx, "agent_sessions", row, row.Version)
		}
	}
	if err != nil {
		slog.Warn("chat summary not saved", "session", row.ID, "error", err)
	}
	return rest
}

// summaryInput is the earlier summary and the folded turns, newest kept
// when it is too long.
func summaryInput(summary string, turns []core.Job) string {
	b := strings.Builder{}
	for _, t := range turns {
		b.WriteString("用户：" + t.Input.Prompt + "\n助手：" + t.Result + "\n\n")
	}
	text := []rune(b.String())
	if room := billing.SummaryInputChars - len([]rune(summary)) - 20; len(text) > room {
		text = text[len(text)-max(room, 0):]
	}
	return "已有摘要：" + summary + "\n\n新增对话：\n" + string(text)
}

func summaryMessages(text string) []any {
	return []any{map[string]string{"role": "system", "content": summarySystem}, map[string]string{"role": "user", "content": text}}
}
