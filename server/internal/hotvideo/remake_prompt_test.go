package hotvideo

import (
	"doubo/server/internal/vision"
	"fmt"
	"strings"
	"testing"
)

func remakeFixture() *vision.Breakdown {
	return &vision.Breakdown{
		Subjects: []vision.Subject{
			{Name: "男主角", Kind: "person"},
			{Name: "眼镜女生", Kind: "person"},
			{Name: "女生", Kind: "person"},
			{Name: "口红", Kind: "product"},
		},
		Hook:  "男主角指向镜头说出台词。",
		Style: "影视混剪，暖色调。",
		Shots: []vision.Shot{
			{Start: 0, End: 3, Scene: "投影幕布前", Action: "男主角抬手指向前方", Camera: "中近景", Speech: "把好运打包给我女儿"},
			{Start: 3, End: 6, Scene: "夜晚户外", Action: "男主角看着眼镜女生，眼镜女生微笑", Camera: "近景", Speech: "眼镜女生要开心"},
			{Start: 6, End: 9, Scene: "餐厅", Action: "女生拿起口红", Camera: "特写"},
		},
	}
}

// The pictures take the swapped subjects' places in every shot they are in,
// the original only lends its pacing, and the lines stay as they were said.
func TestRemakePromptPutsThePicturesIntoTheShots(t *testing.T) {
	got := RemakePrompt(remakeFixture(), Original{Title: "祝福", Duration: 9}, 9, 2000, 2,
		[]Swap{{Name: "女生", Picture: 2}, {Name: "眼镜女生", Picture: 1}})
	for _, want := range []string{
		"参考@视频1的画面结构、镜头运动和节奏，复刻一条 9 秒的同款视频。",
		"替换：女生＝@图片2中的人物；眼镜女生＝@图片1中的人物。",
		"没有替换的保持@视频1的样子。",
		"男主角看着@图片1中的人物，@图片1中的人物微笑",
		"@图片2中的人物拿起口红",
		"台词“眼镜女生要开心”",
		"画面中不要出现字幕、水印和平台标识。画面风格：影视混剪，暖色调。\n0–3秒：",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in\n%s", want, got)
		}
	}
	for _, banned := range []string{"保持原样", "。。", "钩子"} {
		if strings.Contains(got, banned) {
			t.Fatalf("%q in\n%s", banned, got)
		}
	}
}

func TestRemakePromptWithoutSwaps(t *testing.T) {
	b := remakeFixture()
	if got := RemakePrompt(b, Original{Duration: 9}, 9, 2000, 0, nil); !strings.HasPrefix(got, "参考@视频1的画面结构、镜头运动和节奏，复刻一条 9 秒的同款视频。") || !strings.Contains(got, "男主角抬手") {
		t.Fatal(got)
	}
	if got := RemakePrompt(b, Original{Duration: 9}, 9, 2000, 2, nil); !strings.Contains(got, "换成@图片1、@图片2中的商品或人物") {
		t.Fatal(got)
	}
	if got := RemakePrompt(nil, Original{Title: "开箱", Text: " 黄皮也能涂 "}, 5, 2000, 0, nil); !strings.HasSuffix(got, "视频主题：开箱\n原视频文案：黄皮也能涂") {
		t.Fatal(got)
	}
	// A product swap names the picture as a 商品; the limit is in characters.
	got := RemakePrompt(b, Original{Duration: 9}, 9, 60, 1, []Swap{{Name: "口红", Picture: 1}})
	if !strings.Contains(got, "口红＝@图片1中的商品") || len([]rune(got)) != 60 {
		t.Fatal(got)
	}
}

// A longer original is squeezed into the generated length, shots that land
// in the same seconds merging.
func TestRemakePromptSqueezesTheShots(t *testing.T) {
	got := RemakePrompt(remakeFixture(), Original{Duration: 9}, 3, 2000, 0, nil)
	if !strings.Contains(got, "\n0–1秒：") || !strings.Contains(got, "\n1–2秒：") || !strings.Contains(got, "\n2–3秒：") {
		t.Fatal(got)
	}
}

// Every shot of the original keeps its seconds; over the limit the
// descriptions shrink evenly, the lines stay whole and no mention is cut.
func TestRemakePromptFitsEveryShotUnderTheLimit(t *testing.T) {
	b := &vision.Breakdown{Subjects: []vision.Subject{{Name: "女生", Kind: "person"}}}
	for i := range 12 {
		b.Shots = append(b.Shots, vision.Shot{Start: float64(i * 2), End: float64(i*2 + 2),
			Scene: strings.Repeat("场景描写", 8), Action: "女生" + strings.Repeat("做动作", 10), Camera: "近景", Speech: fmt.Sprintf("第%d句", i)})
	}
	whole := RemakePrompt(b, Original{Duration: 24}, 24, 0, 1, []Swap{{Name: "女生", Picture: 1}})
	if !strings.Contains(whole, "\n22–24秒：") || strings.Count(whole, "秒：") != 12 {
		t.Fatal("a shot left out:", whole)
	}
	got := RemakePrompt(b, Original{Duration: 24}, 24, 900, 1, []Swap{{Name: "女生", Picture: 1}})
	if runes(got) > 900 || !strings.Contains(got, "\n22–24秒：") || !strings.HasSuffix(got, "台词“第11句”") {
		t.Fatal(runes(got), got)
	}
	if clause("看着@图片1中的人物", 5, true) != "看着" || clause("看着@图片1中的人物笑", 10, true) != "看着@图片1中的人物" ||
		clause("深色西装、格纹领带，白衬衫", 9, false) != "深色西装" || clause("近景，固定镜头", 1, false) != "" || clause("夜晚户外长椅", 5, false) != "" {
		t.Fatal(clause("看着@图片1中的人物", 5, true), clause("深色西装、格纹领带，白衬衫", 9, false))
	}
}

// A swapped name inside a kept subject's longer name stays put, and a
// one-character name is not replaced across other words.
func TestRemakePromptLeavesKeptNamesAlone(t *testing.T) {
	b := &vision.Breakdown{
		Subjects: []vision.Subject{{Name: "男主角", Kind: "person"}, {Name: "主角", Kind: "person"}, {Name: "她", Kind: "person"}},
		Shots:    []vision.Shot{{Start: 0, End: 3, Action: "男主角看向主角，她的女儿在旁边"}},
	}
	got := RemakePrompt(b, Original{Duration: 3}, 3, 2000, 2, []Swap{{Name: "主角", Picture: 1}, {Name: "她", Picture: 2}})
	if !strings.Contains(got, "0–3秒：男主角看向@图片1中的人物，她的女儿在旁边") {
		t.Fatal(got)
	}
}

// Shortened shots keep who does what with the pictures before the scene.
func TestShortenedShotsKeepTheSwap(t *testing.T) {
	b := remakeFixture()
	b.Shots[1].Scene = "夜晚户外，背景模糊的绿色墙面与圆形灯光，远处有车流"
	got := RemakePrompt(b, Original{Duration: 9}, 9, 260, 1, []Swap{{Name: "眼镜女生", Picture: 1}})
	if runes(got) > 260 || !strings.Contains(got, "3–6秒：") || !strings.Contains(got, "男主角看着@图片1中的人物") {
		t.Fatal(runes(got), got)
	}
	// A pause before the picture does not cut it out.
	b.Shots[1].Action = "男主角举杯说话；切到眼镜女生在绿植前微笑"
	got = RemakePrompt(b, Original{Duration: 9}, 9, 240, 1, []Swap{{Name: "眼镜女生", Picture: 1}})
	if !strings.Contains(got, "男主角举杯说话；切到@图片1中的人物") {
		t.Fatal(got)
	}
}

// The shots' own span sets the scale: a rounded or missing length neither
// piles the shots into the last seconds nor leaves the end without them.
func TestRemakePromptScalesByTheShots(t *testing.T) {
	b := &vision.Breakdown{}
	for i := range 6 {
		b.Shots = append(b.Shots, vision.Shot{Start: float64(i * 5), End: float64(i*5 + 5), Action: fmt.Sprintf("动作%d", i)})
	}
	for _, length := range []float64{10, 60, 0} {
		got := RemakePrompt(b, Original{Duration: length}, 12, 0, 0, nil)
		if strings.Count(got, "秒：") != 6 || !strings.Contains(got, "\n10–12秒：动作5") {
			t.Fatal(length, got)
		}
	}
	short := &vision.Breakdown{Shots: []vision.Shot{{Start: 0, End: 1.5, Action: "a"}, {Start: 1.5, End: 3, Action: "b"}}}
	if got := RemakePrompt(short, Original{Duration: 3}, 5, 0, 0, nil); !strings.HasSuffix(got, "\n3–5秒：b") {
		t.Fatal(got)
	}
}

// Shortening keeps every picture of a shot, and over-long lines are
// shortened last instead of losing the final shots.
func TestShortenedShotsKeepEveryPictureAndTheEnd(t *testing.T) {
	b := &vision.Breakdown{Subjects: []vision.Subject{{Name: "男主角", Kind: "person"}, {Name: "女主角", Kind: "person"}}}
	for i := range 10 {
		b.Shots = append(b.Shots, vision.Shot{Start: float64(i * 2), End: float64(i*2 + 2), Scene: "客厅",
			Action: "男主角走过来把一束花递给女主角", Speech: strings.Repeat("台词很长", 15)})
	}
	swaps := []Swap{{Name: "男主角", Picture: 1}, {Name: "女主角", Picture: 2}}
	got := RemakePrompt(b, Original{Duration: 20}, 20, 600, 2, swaps)
	if runes(got) > 600 || strings.Count(got, "@图片2中的人物") < 11 || !strings.Contains(got, "\n18–20秒：") {
		t.Fatal(runes(got), got)
	}
	if !Unknown(b, []Swap{{Name: "主角", Picture: 1}}) || Unknown(b, swaps) || !Unknown(nil, swaps) || Unknown(nil, nil) {
		t.Fatal("unknown swaps")
	}
}

// v3 shots mark the subjects (【女生】): only the marks change, kept ones lose
// their brackets, and plain words with the same characters stay.
func TestRemakePromptReplacesOnlyMarkedNames(t *testing.T) {
	b := &vision.Breakdown{
		Subjects: []vision.Subject{{Name: "女生", Kind: "person"}, {Name: "男主角", Kind: "person"}},
		Shots:    []vision.Shot{{Start: 0, End: 3, Scene: "女生宿舍", Action: "【女生】走向【男主角】，女生们在笑", Speech: "女生宿舍到了"}},
	}
	got := RemakePrompt(b, Original{Duration: 3}, 3, 2000, 1, []Swap{{Name: "女生", Picture: 1}})
	if !strings.Contains(got, "0–3秒：女生宿舍，@图片1中的人物走向男主角，女生们在笑，台词“女生宿舍到了”") || strings.ContainsAny(got, "【】") {
		t.Fatal(got)
	}
}

// Words only shown on screen are not voiced; with no breakdown the video
// itself leads, and an upload's placeholder title is no theme.
func TestRemakePromptLeavesCaptionsAndPlaceholderTitlesOut(t *testing.T) {
	b := &vision.Breakdown{Shots: []vision.Shot{{Start: 0, End: 3, Action: "开箱", Speech: "终于到了", Caption: "双十一必买"}}}
	if got := RemakePrompt(b, Original{Duration: 3}, 3, 2000, 0, nil); !strings.HasSuffix(got, "0–3秒：开箱，台词“终于到了”") || strings.Contains(got, "双十一必买") {
		t.Fatal(got)
	}
	got := RemakePrompt(nil, Original{Title: UploadTitle}, 5, 2000, 0, nil)
	if !strings.HasSuffix(got, "画面内容、人物动作和场景以@视频1为准，按它的镜头顺序复刻。") || strings.Contains(got, "视频主题") {
		t.Fatal(got)
	}
}
