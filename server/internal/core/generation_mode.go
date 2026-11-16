package core

import (
	"slices"
	"strings"
)

// NormalizeGenerationMode keeps provider aliases out of the shared editor.
func NormalizeGenerationMode(mode string) string {
	mode = strings.NewReplacer("-", "_", " ", "_", "/", "_").Replace(strings.ToLower(strings.TrimSpace(mode)))
	switch mode {
	case "t2v", "text2video", "text_video", "text_to_video":
		return "t2v"
	case "i2v", "image2video", "image_video", "image_to_video", "first_frame":
		return "i2v"
	case "keyframe", "key_frame", "first_last", "first_last_frame", "start_end", "start_end_to_video":
		return "keyframe"
	case "omni_ref", "omni_reference", "multi_ref", "multi_reference", "reference_image", "reference_to_video", "subject_reference":
		return "omni_ref"
	default:
		return mode
	}
}

func NormalizeGenerationModes(modes []string) []string {
	out, seen := make([]string, 0, len(modes)), map[string]bool{}
	for _, raw := range modes {
		mode := NormalizeGenerationMode(raw)
		if mode != "" && !seen[mode] {
			seen[mode] = true
			out = append(out, mode)
		}
	}
	return out
}

func GenerationMode(kind string, modes []string, counts map[string]int, total int) string {
	modes = NormalizeGenerationModes(modes)
	if kind == "chat" {
		return ""
	}
	text := "t2v"
	if kind == "image" {
		text = "t2i"
	}
	if kind == "audio" {
		return "t2a"
	}
	if total == 0 {
		if len(modes) == 0 || slices.Contains(modes, text) {
			return text
		}
		return modes[0]
	}
	if kind == "image" {
		return "i2i"
	}
	if counts["image"] == 1 && total == 1 && slices.Contains(modes, "i2v") {
		return "i2v"
	}
	if slices.Contains(modes, "omni_ref") {
		return "omni_ref"
	}
	if counts["image"] == total && slices.Contains(modes, "keyframe") {
		return "keyframe"
	}
	if counts["image"] == 1 && total == 1 {
		return "i2v"
	}
	return "omni_ref"
}
