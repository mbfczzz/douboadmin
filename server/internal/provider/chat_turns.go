package provider

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"regexp"
	"slices"
)

// How much of a conversation is sent again with each turn. Every character
// is paid for on every turn, so only the last few turns go, and only the
// newest plan goes whole.
const (
	historyTurns = 6
	historyRunes = 8000 // all earlier turns together
)

// recentTurns reads up to 30 turns before j in its project, oldest first,
// from one page of the user's chat jobs rather than all of their jobs.
func recentTurns(ctx context.Context, s store.Store, j core.Job) ([]core.Job, error) {
	q := core.JobQuery{User: j.UserID, Kind: "chat", Status: "succeeded", Session: j.Input.SessionID, NoSession: j.Input.SessionID == "", Page: 1, Size: 30}
	page, err := s.JobPage(ctx, q)
	if err != nil {
		return nil, err
	}
	// Turns the user edited and asked again are left out.
	revised := map[string]bool{j.Input.Revises: true}
	for _, old := range page.Items {
		revised[old.Input.Revises] = true
	}
	out := []core.Job{}
	for _, old := range page.Items {
		if revised[old.ID] {
			continue
		}
		if old.Input.SessionID == j.Input.SessionID && old.ID != j.ID && old.CreatedAt.Before(j.CreatedAt) {
			out = append(out, old)
		}
	}
	slices.Reverse(out)
	return out, nil
}

var planBlock = regexp.MustCompile("(?s)```(plan|json)?\\s*\\n?(.*?)```")
var planTitle = regexp.MustCompile(`"title"\s*:\s*"([^"]{0,40})"`)

// trimTurns shortens earlier replies: plans other than the newest become a
// one-line note (the newest is what a revision builds on), each reply is
// capped at keep characters, and the oldest turns go first when all of them
// together are still too long.
func trimTurns(turns []core.Job, keep int) []core.Job {
	return trim(turns, keep, historyRunes)
}

// trim does the work; budget 0 keeps every turn (each still capped).
func trim(turns []core.Job, keep, budget int) []core.Job {
	newest := -1
	for i := len(turns) - 1; i >= 0 && newest < 0; i-- {
		if hasPlan(turns[i].Result) {
			newest = i
		}
	}
	out := make([]core.Job, len(turns))
	total := 0
	for i := range turns {
		t := turns[i]
		if i != newest {
			t.Result = planBlock.ReplaceAllStringFunc(t.Result, func(block string) string {
				m := planBlock.FindStringSubmatch(block)
				if m[1] != "plan" && !promptKey.MatchString(m[2]) {
					return block
				}
				title := "创作方案"
				if tm := planTitle.FindStringSubmatch(m[2]); tm != nil {
					title = tm[1]
				}
				return "（这里给出过方案《" + title + "》，已被后面的版本取代）"
			})
		}
		if r := []rune(t.Result); len(r) > keep {
			t.Result = string(r[:keep])
		}
		// An earlier message is capped too: a long one (a whole prompt pasted
		// to be revised) was read whole on its own turn, and history must
		// stay within what a turn holds (billing.chatHistoryChars).
		if r := []rune(t.Input.Prompt); len(r) > keep {
			t.Input.Prompt = string(r[:keep]) + "…（后文略）"
		}
		out[i] = t
		total += len([]rune(t.Input.Prompt)) + len([]rune(t.Result))
	}
	for budget > 0 && len(out) > 1 && total > budget {
		total -= len([]rune(out[0].Input.Prompt)) + len([]rune(out[0].Result))
		out = out[1:]
	}
	return out
}

func hasPlan(text string) bool {
	for _, m := range planBlock.FindAllStringSubmatch(text, -1) {
		if m[1] == "plan" || promptKey.MatchString(m[2]) {
			return true
		}
	}
	return false
}

var promptKey = regexp.MustCompile(`"prompt"\s*:`)
