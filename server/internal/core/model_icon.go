package core

import "strings"

func (m Model) DisplayIcon() string {
	if m.Settings.Icon != "" {
		return m.Settings.Icon
	}
	name := strings.ToLower(m.Key + " " + m.Name)
	rules := [][2]string{{"seedream", "jimeng"}, {"seedance", "bytedance"}, {"nano-banana", "google"}, {"imagen", "google"}, {"veo", "google"}, {"gpt", "openai"}, {"sora", "openai"}, {"wan", "qwen"}}
	for _, slug := range []string{"openai", "google", "gemini", "midjourney", "flux", "stability", "kling", "jimeng", "doubao", "bytedance", "volcengine", "qwen", "hunyuan", "kolors", "minimax", "suno", "vidu", "runway", "luma", "pika", "ideogram", "recraft", "deepseek", "claude", "anthropic", "grok"} {
		rules = append(rules, [2]string{slug, slug})
	}
	for _, r := range rules {
		if strings.Contains(name, r[0]) {
			return "/media/model-icons/" + r[1] + ".png"
		}
	}
	return ""
}
