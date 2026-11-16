package core

import "testing"

func TestGenerationModeAliasesNormalizeAtModelBoundary(t *testing.T) {
	m := Model{
		Kind:           "video",
		Modes:          []string{"text_to_video", "image_to_video", "first_last_frame", "multi_ref"},
		ReferenceTypes: []string{"image", "video"},
		Settings:       ModelSettings{Modes: []string{"image_to_video", "multi_ref"}},
	}.Effective()
	want := []string{"i2v", "omni_ref"}
	if len(m.Modes) != len(want) || len(m.Settings.Modes) != len(want) {
		t.Fatal(m.Modes, m.Settings.Modes)
	}
	for i := range want {
		if m.Modes[i] != want[i] || m.Settings.Modes[i] != want[i] {
			t.Fatal(m.Modes, m.Settings.Modes)
		}
	}
	if got := GenerationMode("video", []string{"image_to_video"}, map[string]int{"image": 1}, 1); got != "i2v" {
		t.Fatal(got)
	}
}
