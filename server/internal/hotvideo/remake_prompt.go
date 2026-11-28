package hotvideo

import (
	"doubo/server/internal/vision"
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"
)

// 生成同款's description, built from the breakdown with no chat model (no
// extra charge or wait). With swaps the user's pictures take the subjects'
// places in every shot they are in, and the original's video only lends its
// pacing and camera work: a description that still describes the original
// people next to their full video makes the model copy them.

// Swap: the breakdown subject named Name is replaced by @图片Picture. Look
// is the picture's own description (the server reads it, never a client):
// the text must say who the new person is, or the model draws the one
// @视频1 shows.
type Swap struct {
	Name    string `json:"name"`
	Picture int    `json:"picture"`
	Look    string `json:"-"`
}

// Original is what the remake task keeps about the video.
type Original struct {
	Title, Text string
	Duration    float64
}

// The video model's own subtitles come out garbled, and the original's
// watermarks are not the user's to copy.
const cleanFrame = "画面中不要出现字幕、水印和平台标识。"

func RemakePrompt(b *vision.Breakdown, o Original, seconds, limit, images int, swaps []Swap) string {
	lock, tail := lockRules(b, images, swaps)
	// A swap is always the whole video: the binding goes in whole, whatever
	// the limit (the shots are shortened instead).
	head := remakeHead(b, seconds, images, swaps) + lock + cleanFrame
	if b == nil || len(b.Shots) == 0 { // no breakdown: the video itself, and what its caption says
		head += "画面内容、人物动作和场景以@视频1为准，按它的镜头顺序复刻。"
		if title := strings.TrimSpace(o.Title); title != "" && title != UploadTitle {
			head += "视频主题：" + title
		}
		if text := cut(strings.TrimSpace(o.Text), 300); text != "" {
			head += "\n原视频文案：" + text
		}
		if tail != "" {
			head += "\n" + tail
		}
		return cut(head, limit)
	}
	// The breakdown's hook is analysis (why it works); the first shots carry
	// what the opening shows.
	if b.Style != "" {
		head += "画面风格：" + sentence(b.Style)
	}
	list := beats(b.Shots, o.Duration, seconds, swapper(b, swaps))
	if tail == "" {
		return fitBeats(head, list, limit)
	}
	// The binding once more after the shots, where the model reads last.
	room := limit
	if limit > 0 { // the shots shrink first; a limit too small even for the opening keeps the opening
		room = max(limit-runes(tail)-1, runes(head))
	}
	return cut(fitBeats(head, list, room)+"\n"+tail, limit)
}

// Without swaps the remake copies the original. With them @视频1 lends only
// its movement, camera, pacing and setting: told to "复刻同款", or not told
// which person in @视频1 each picture replaces, a model plays the original
// back and uses the pictures for an opening shot (their studio background
// first, then @视频1's own people). So each swap names the original person
// with the look that tells them apart, and the pictures are only looks.
func remakeHead(b *vision.Breakdown, seconds, images int, swaps []Swap) string {
	if len(swaps) == 0 && images == 0 {
		return fmt.Sprintf("参考@视频1的画面结构、镜头运动和节奏，复刻一条 %d 秒的同款视频。", seconds)
	}
	reference := fmt.Sprintf("以@视频1为动作、运镜、节奏和场景参考，生成一条 %d 秒的视频。", seconds)
	head := reference
	pictures := make([]string, images)
	for i := range pictures {
		pictures[i] = fmt.Sprintf("@图片%d", i+1)
	}
	only := "只提供长相和外观，不作为开场画面，画面里不要出现图片中的背景、姿势和构图；从第一秒起就是@视频1的场景。"
	if len(swaps) == 0 {
		return head + "把@视频1中的商品或人物换成" + strings.Join(pictures, "、") + "中的商品或人物，外观以图片为准，不要沿用@视频1中原来的样子。" + strings.Join(pictures, "、") + only
	}
	// The swap leads, and says who the new person is (the picture's look);
	// the original is named only, never described (its hair and clothes
	// in the text draw it again).
	cast := make([]string, len(swaps))
	used := []string{}
	for i, s := range swaps {
		cast[i] = "把@视频1中的" + s.Name + "整个换成" + pictureOf(b, s)
		if look := strings.TrimSpace(s.Look); look != "" {
			cast[i] += "（" + strings.TrimRight(look, "。.") + "）"
		}
		if ref := fmt.Sprintf("@图片%d", s.Picture); !slices.Contains(used, ref) {
			used = append(used, ref)
		}
	}
	return "替换：" + strings.Join(cast, "；") + "。" + reference + strings.Join(used, "、") + only +
		"被替换的人物和商品一律以图片为准，不要沿用@视频1中原来的长相、发型和样子；没有替换的保持@视频1的样子。"
}

// Unknown reports a swap naming no subject of the breakdown (one read
// before the breakdown changed): the page must load the subjects again.
func Unknown(b *vision.Breakdown, swaps []Swap) bool {
	for _, s := range swaps {
		known := false
		if b != nil {
			for _, subject := range b.Subjects {
				known = known || subject.Name == s.Name
			}
		}
		if !known {
			return true
		}
	}
	return false
}

// "@图片1中的人物", by what the subject is.
func pictureOf(b *vision.Breakdown, s Swap) string {
	what := "主体"
	if b != nil {
		for _, subject := range b.Subjects {
			if subject.Name == s.Name && subject.Kind == "person" {
				what = "人物"
			} else if subject.Name == s.Name && subject.Kind == "product" {
				what = "商品"
			}
		}
	}
	return fmt.Sprintf("@图片%d中的%s", s.Picture, what)
}

// swapper writes the picture wherever a shot names a replaced subject.
// v3 breakdowns mark the names (【眼镜女生】): then only the marks are
// replaced, kept ones lose their brackets, and plain words ("女生宿舍") are
// never hit.
// Older text without marks is matched by name: every subject's name takes
// part, longest first (kept ones as they are), so a swapped "主角" is not
// found inside a kept "男主角"; one-character names are not replaced.
func swapper(b *vision.Breakdown, swaps []Swap) func(string) string {
	to := map[string]string{}
	if b != nil {
		for _, subject := range b.Subjects {
			to[subject.Name] = subject.Name
		}
	}
	for _, s := range swaps {
		to[s.Name] = pictureOf(b, s)
	}
	marked, plain := []string{}, []string{}
	for _, name := range sortedNames(to) {
		marked = append(marked, "【"+name+"】", to[name])
		if runes(name) >= 2 {
			plain = append(plain, name, to[name])
		}
	}
	if b != nil && usesMarks(b.Shots) {
		return oneItem(strings.NewReplacer(append(marked, "【", "", "】", "")...).Replace)
	}
	return oneItem(strings.NewReplacer(plain...).Replace)
}

// ordinal is "第三套" right before a picture's product: the original showed
// several (an outfit-change video), the remake shows the one in the picture.
var ordinal = regexp.MustCompile(`第[一二三四五六七八九十百0-9]+[套件款身个]\s*(@图片\d+中的(?:商品|主体))`)

// oneItem drops such ordinals once the names are replaced, so no shot asks
// for "第十套" of a single item (which sends the model back to @视频1's).
func oneItem(put func(string) string) func(string) string {
	return func(text string) string { return ordinal.ReplaceAllString(put(text), "$1") }
}

// usesMarks: the breakdown writes its subjects as 【name】 (v3).
func usesMarks(shots []vision.Shot) bool {
	for _, s := range shots {
		if strings.Contains(s.Scene+s.Action, "【") {
			return true
		}
	}
	return false
}

// sortedNames: longest first, then in order (a stable replacement).
func sortedNames(to map[string]string) []string {
	names := make([]string, 0, len(to))
	for name := range to {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool {
		if runes(names[i]) != runes(names[j]) {
			return runes(names[i]) > runes(names[j])
		}
		return names[i] < names[j]
	})
	return names
}

// sentence ends the text with exactly one 。.
func sentence(s string) string {
	return strings.TrimRight(strings.TrimSpace(s), "。.！!；;，, ") + "。"
}

func cut(s string, limit int) string {
	if r := []rune(s); limit > 0 && len(r) > limit {
		return string(r[:limit])
	}
	return s
}
