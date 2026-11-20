package provider

import (
	"doubo/server/internal/core"
	"strings"
	"testing"
)

func turn(prompt, result string) core.Job {
	return core.Job{Input: core.JobInput{Prompt: prompt}, Result: result}
}

// Only the newest plan is resent whole; earlier ones become a one-line note.
func TestOlderPlansAreNotResent(t *testing.T) {
	plan := func(title string) string {
		return "方案：\n```plan\n{\"title\":\"" + title + "\",\"prompt\":\"" + strings.Repeat("镜", 500) + "\"}\n```"
	}
	out := trimTurns([]core.Job{turn("做", plan("初稿")), turn("这是什么", "一段说明"), turn("改开场", plan("第二版")), turn("问", "好的")}, 4000)
	if !strings.Contains(out[0].Result, "《初稿》，已被后面的版本取代") || strings.Contains(out[0].Result, "镜镜") {
		t.Fatal(out[0].Result)
	}
	if out[2].Result != plan("第二版") || out[1].Result != "一段说明" {
		t.Fatal("the newest plan or plain replies changed")
	}
	other := "```json\n{\"a\":1}\n```"
	if trimTurns([]core.Job{turn("a", other), turn("b", plan("x"))}, 4000)[0].Result != other {
		t.Fatal("a code block that is not a plan was rewritten")
	}
}

// Long conversations drop their oldest turns, never the newest.
func TestHistoryStaysWithinItsBudget(t *testing.T) {
	long := strings.Repeat("长", 3000)
	out := trimTurns([]core.Job{turn("1", long), turn("2", long), turn("3", long), turn("4", "短")}, 4000)
	if len(out) != 3 || out[len(out)-1].Result != "短" {
		t.Fatal(len(out))
	}
	if one := trimTurns([]core.Job{turn("1", strings.Repeat("长", 9000))}, 4000); len(one) != 1 || len([]rune(one[0].Result)) != 4000 {
		t.Fatal("the last turn must stay, capped")
	}
}
