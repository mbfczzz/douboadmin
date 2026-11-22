package settings

import "testing"

func TestChatModels(t *testing.T) {
	got, err := ChatModels(" deepseek-chat，deepseek-reasoner\ndeepseek-chat ")
	if err != nil || len(got) != 2 || got[1] != "deepseek-reasoner" {
		t.Fatal(got, err)
	}
	for _, bad := range []string{"deep seek", "a/b", "1,2,3,4,5,6"} {
		if _, err := ChatModels(bad); err == nil {
			t.Fatal("accepted", bad)
		}
	}
	if err := validate(Group{ID: "chat"}, Values{"CHAT_ARK_MODELS": "ep-2026 x"}, false); err == nil {
		t.Fatal("bad ark model id saved")
	}
	for _, id := range []string{"multi-20260618163903-nn4zw", "doubao-seedance-2-0"} {
		if _, err := ArkChatModels(id); err == nil {
			t.Fatal("media generation endpoint accepted as chat", id)
		}
		if err := validate(Group{ID: "vision", Fields: []Field{{Key: "VISION_MODEL", Label: "模型 ID"}}}, Values{"VISION_MODEL": id}, false); err == nil {
			t.Fatal("media generation endpoint accepted as vision", id)
		}
	}
}
