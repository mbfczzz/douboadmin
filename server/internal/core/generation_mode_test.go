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

// Video references go through 全能参考 whenever the model offers it; 图生视频 /
// 首尾帧 remain only for models without it.
func TestVideoReferencesPreferOmniReference(t *testing.T) {
	all := []string{"t2v", "i2v", "keyframe", "omni_ref"}
	for _, c := range []struct {
		modes  []string
		counts map[string]int
		total  int
		want   string
	}{
		{all, map[string]int{}, 0, "t2v"},
		{all, map[string]int{"image": 1}, 1, "omni_ref"},
		{all, map[string]int{"image": 2}, 2, "omni_ref"},
		{all, map[string]int{"video": 1}, 1, "omni_ref"},
		{nil, map[string]int{"image": 1}, 1, "omni_ref"},
		{[]string{"t2v", "i2v"}, map[string]int{"image": 1}, 1, "i2v"},
		{[]string{"keyframe"}, map[string]int{"image": 2}, 2, "keyframe"},
	} {
		if got := GenerationMode("video", c.modes, c.counts, c.total); got != c.want {
			t.Fatal(c.modes, c.counts, got)
		}
	}
}
