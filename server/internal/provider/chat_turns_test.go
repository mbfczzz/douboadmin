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

// A whole prompt pasted to be revised (Agent messages may now be 20,000
// characters) is read whole on its own turn; sent again as history it is
// capped like a reply, so history stays within what a turn holds.
func TestLongEarlierMessagesAreCappedInHistory(t *testing.T) {
	pasted := strings.Repeat("词", 20000)
	out := trimTurns([]core.Job{turn(pasted, "改好了"), turn(pasted, strings.Repeat("长", 9000))}, 4000)
	total := 0
	for _, o := range out {
		total += len([]rune(o.Input.Prompt)) + len([]rune(o.Result))
		if !strings.HasSuffix(o.Input.Prompt, "…（后文略）") || len([]rune(o.Input.Prompt)) != 4000+len([]rune("…（后文略）")) {
			t.Fatal("not capped", len([]rune(o.Input.Prompt)))
		}
	}
	if len(out) != 1 || total > historyRunes+20 {
		t.Fatal(len(out), total)
	}
	if short := trimTurns([]core.Job{turn("写一段咖啡店脚本", "好的")}, 4000); short[0].Input.Prompt != "写一段咖啡店脚本" {
		t.Fatal("a short message is sent as it was")
	}
}

// A summary's input (budget 0) keeps every turn, a long newest plan or not.
func TestSummaryInputKeepsEveryTurnWithALongPlan(t *testing.T) {
	long := "```plan\n{\"prompt\":\"" + strings.Repeat("镜", 9000) + "\"}\n```"
	turns := []core.Job{turn("一", strings.Repeat("说", 3000)), turn("二", strings.Repeat("说", 3000)), turn("出方案", long), turn("三", "好")}
	if out := trim(turns, 2000, 0); len(out) != 4 {
		t.Fatal("turns dropped from a summary's input:", len(out))
	}
}
