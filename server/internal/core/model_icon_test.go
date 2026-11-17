package core

import "testing"

func TestDisplayIconRecognizesSeedanceAbbreviation(t *testing.T) {
	for _, name := range []string{"Sd 2.5 低价2", "SD2.0 fast低价1", "sd-2.0 mini"} {
		model := Model{Name: name, Key: "opaque-upstream-key"}
		if got := model.DisplayIcon(); got != "/media/model-icons/bytedance.png" {
			t.Fatalf("%q icon = %q", name, got)
		}
	}
	if got := (Model{Name: "SDXL Image", Key: "opaque"}).DisplayIcon(); got != "" {
		t.Fatalf("unrelated abbreviation matched: %q", got)
	}
	custom := Model{Name: "Sd 2.5", Settings: ModelSettings{Icon: "https://icons.example/custom.png"}}
	if got := custom.DisplayIcon(); got != custom.Settings.Icon {
		t.Fatalf("custom icon lost: %q", got)
	}
}
