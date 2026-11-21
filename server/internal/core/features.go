package core

// Features are the mini-program's functions as 后台 → 日志管理 → 功能使用
// counts them: clicks are taps on their entries, uses are tasks submitted
// with them. Keys match the 创作 page entries (pages/studio/entries.ts).
var Features = []struct{ Key, Name string }{
	{"video", "视频创作"}, {"image", "图片创作"}, {"mix", "AI混剪"}, {"remake", "一键复刻"},
	{"ad", "剧情带货"}, {"shop", "探店视频"}, {"avatar", "数字人"}, {"article", "图文成片"},
	{"sing", "视频唱歌"}, {"remix", "视频二创"}, {"extract", "文案提取"}, {"idphoto", "AI证件照"},
	{"comic", "漫画推文"}, {"tryon", "AI试衣"}, {"agent", "Agent"}, {"template", "模板做同款"},
	{"hot", "热门视频"},
}

func IsFeature(key string) bool {
	for _, f := range Features {
		if f.Key == key {
			return true
		}
	}
	return false
}

// JobFeature names the function a submitted task used ("" when none: a
// script written by AI写剧本, a preparation step).
func JobFeature(in JobInput) string {
	switch {
	case in.SessionID != "":
		return "agent"
	case in.Kind == "chat":
		return ""
	case in.TemplateID != "":
		return "template"
	case in.Feature != "" && IsFeature(in.Feature):
		return in.Feature
	case in.Kind == "video" || in.Kind == "image" || in.Kind == "mix":
		return in.Kind
	}
	return ""
}
