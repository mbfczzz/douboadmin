package core

import "slices"

func GenerationMode(kind string, modes []string, counts map[string]int, total int) string {
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
