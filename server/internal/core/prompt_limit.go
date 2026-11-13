package core

func DefaultPromptChars(kind string) int {
	switch kind {
	case "image":
		return 2000
	case "video":
		return 20000
	default:
		return 500
	}
}

func MaxPromptChars(kind string) int {
	if kind == "image" || kind == "video" {
		return 100000
	}
	return 500
}

// Zero means inherit the default for this model's modality.
func (s ModelSettings) PromptLimit(kind string) int {
	if s.MaxPromptChars > 0 {
		return s.MaxPromptChars
	}
	return DefaultPromptChars(kind)
}
