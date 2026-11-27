package core

// DefaultPromptChars applies while 模型管理 leaves 提示词字数上限 at 0. A chat
// message carries whole prompts to be revised (often over 2,000 characters);
// the models take far more, 500 was only ours.
func DefaultPromptChars(kind string) int {
	switch kind {
	case "image":
		return 2000
	case "video":
		return 20000
	case "chat":
		return 20000
	default:
		return 500
	}
}

// MaxPromptChars is the most 模型管理 may set: a chat message stays well
// within the chat models' context, which also holds the conversation.
func MaxPromptChars(kind string) int {
	switch kind {
	case "image", "video":
		return 100000
	case "chat":
		return 50000
	default:
		return 500
	}
}

// Zero means inherit the default for this model's modality.
func (s ModelSettings) PromptLimit(kind string) int {
	if s.MaxPromptChars > 0 {
		return s.MaxPromptChars
	}
	return DefaultPromptChars(kind)
}
