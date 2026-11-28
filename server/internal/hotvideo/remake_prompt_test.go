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

// A swap fixes @视频1 first (ratio, camera, framing, order and speed of
// the actions, setting), replaces only the chosen subjects, and pins each:
// identity with the picture's look (the original is named, never
// described), clothes, taking over the actions; then props, footing, light;
// the pictures take the swapped subjects' places in every shot, and the
// lines stay as they were said.
func TestRemakePromptPutsThePicturesIntoTheShots(t *testing.T) {
	b := remakeFixture()
	b.Subjects[1].Look = "黑色长直发、灰色蕾丝领大衣" // the original's: never written
	b.Shots[0].Scene = "投影幕布前。"
	got := RemakePrompt(b, Original{Title: "祝福", Duration: 9}, 9, 20000, 2,
		[]Swap{{Name: "女生", Picture: 2}, {Name: "眼镜女生", Picture: 1, Look: "圆脸，黑色长波浪卷发，下巴有一颗小痣。"}})
	if !strings.HasPrefix(got, "参考@视频1，生成一条 9 秒的视频：保持原视频的画面比例、机位与运镜、构图、动作顺序与速度。保留原视频的场景与环境（投影幕布前、夜晚户外、餐厅）") {
		t.Fatal(got)
	}
	for _, want := range []string{
		"仅将@视频1中的女生替换为@图片2中的人物（脸部必须和@图片2完全一样），将@视频1中的眼镜女生替换为@图片1中的人物（脸部必须和@图片1完全一样）；其他人物、商品和场景保持@视频1的样子。",
		"脸部必须和@图片1完全一样（圆脸，黑色长波浪卷发，下巴有一颗小痣），这是最重要的要求：以@图片1的脸为唯一标准，脸型与下颌线、眉形、眼型与双眼皮、鼻梁与鼻头、嘴唇形状、痣和斑点的位置、肤色都与图片一致",
		"不参考@视频1中眼镜女生的脸，不把两张脸融合，不美颜、不磨皮、不瘦脸、不改脸型",
		"近景、远景、侧脸、低头、转身和快速运动时都保持这张脸",
		"全片每个镜头都是同一个人，不串回@视频1中的眼镜女生。",
		"服装采用@图片1中的穿着，全程同一套",
		"@图片1只负责人物身份和服装，不保留图片里的背景、姿势和手势，也不作为开场画面。",
		"@图片1中的人物接替眼镜女生的全部动作",
		"手中的物品作为独立真实道具保留", "双脚准确接触地面", "无白边、光晕或生硬抠图感",
		"画面质感与@视频1一致（影视混剪，暖色调），",
		"人物台词按下面分镜里的原话，不新增其他口播、对白或字幕。不额外生成 Logo、水印或文字。\n分镜：\n0–3秒：投影幕布前，",
		"男主角看着@图片1中的人物，@图片1中的人物微笑",
		"@图片2中的人物拿起口红",
		"台词“眼镜女生要开心”",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in\n%s", want, got)
		}
	}
	for _, banned := range []string{"保持原样", "。。", "。，", "钩子", "复刻", "同款", "蕾丝领"} {
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
	if got := RemakePrompt(b, Original{Duration: 9}, 9, 2000, 2, nil); !strings.Contains(got, "换成@图片1、@图片2中的商品或人物") || !strings.Contains(got, "不作为开场画面") {
		t.Fatal(got)
	}
	if got := RemakePrompt(nil, Original{Title: "开箱", Text: " 黄皮也能涂 "}, 5, 2000, 0, nil); !strings.HasSuffix(got, "视频主题：开箱\n原视频文案：黄皮也能涂") {
		t.Fatal(got)
	}
	// A product swap is pinned as a 商品; the limit is in characters, and one
	// too small even for the opening keeps the opening.
	got := RemakePrompt(b, Original{Duration: 9}, 9, 20000, 1, []Swap{{Name: "口红", Picture: 1}})
	if !strings.Contains(got, "仅将@视频1中的口红替换为@图片1中的商品") || !strings.Contains(got, "商品严格匹配@图片1：") || strings.Contains(got, "脸部必须和") {
		t.Fatal(got)
	}
	if got := RemakePrompt(b, Original{Duration: 9}, 9, 300, 1, []Swap{{Name: "口红", Picture: 1}}); runes(got) != 300 || !strings.HasPrefix(got, "参考@视频1，生成一条 9 秒的视频") {
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
	limit := roomFor(t, whole, 600)
	got := RemakePrompt(b, Original{Duration: 24}, 24, limit, 1, []Swap{{Name: "女生", Picture: 1}})
	if runes(got) > limit || runes(got) >= runes(whole) || !strings.Contains(got, "\n22–24秒：") || !strings.Contains(got, "台词“第11句”") {
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
	one := []Swap{{Name: "眼镜女生", Picture: 1}}
	limit := roomFor(t, RemakePrompt(b, Original{Duration: 9}, 9, 0, 1, one), 140)
	got := RemakePrompt(b, Original{Duration: 9}, 9, limit, 1, one)
	if runes(got) > limit || !strings.Contains(got, "3–6秒：") || !strings.Contains(got, "男主角看着@图片1中的人物") {
		t.Fatal(runes(got), got)
	}
	// A pause before the picture does not cut it out.
	b.Shots[1].Action = "男主角举杯说话；切到眼镜女生在绿植前微笑"
	got = RemakePrompt(b, Original{Duration: 9}, 9, roomFor(t, RemakePrompt(b, Original{Duration: 9}, 9, 0, 1, one), 120), 1, one)
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
	limit := roomFor(t, RemakePrompt(b, Original{Duration: 20}, 20, 0, 2, swaps), 450)
	got := RemakePrompt(b, Original{Duration: 20}, 20, limit, 2, swaps)
	if runes(got) > limit || strings.Count(got, "@图片2中的人物") < 11 || !strings.Contains(got, "\n18–20秒：") {
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

// The swaps are bound to every shot (a long remake drifts back to @视频1's
// people and products at each cut): before the shots and once more after
// them; a person's picture gives only the face when a product picture gives
// what is worn; "第十套" of a single item goes.
func TestRemakePromptBindsTheSwapsToEveryShot(t *testing.T) {
	b := &vision.Breakdown{
		Subjects: []vision.Subject{{Name: "卷发女生", Kind: "person"}, {Name: "黑发女生", Kind: "person"}, {Name: "通勤穿搭套装", Kind: "product"}},
		Shots: []vision.Shot{
			{Start: 0, End: 2, Action: "【卷发女生】和【黑发女生】走向镜头，展示第一套【通勤穿搭套装】"},
			{Start: 2, End: 15, Action: "【卷发女生】和【黑发女生】走向镜头，展示第十套【通勤穿搭套装】"},
		},
	}
	swaps := []Swap{{Name: "卷发女生", Picture: 1}, {Name: "黑发女生", Picture: 2}, {Name: "通勤穿搭套装", Picture: 3}}
	got := RemakePrompt(b, Original{Duration: 15}, 15, 20000, 3, swaps)
	for _, want := range []string{
		"脸部必须和@图片1完全一样，这是最重要的要求：", "脸部必须和@图片2完全一样，这是最重要的要求：",
		"（全片要求：@图片1中的人物、@图片2中的人物的脸在每一个镜头都和图片完全一样，",
		"不串回@视频1中的卷发女生", "不串回@视频1中的黑发女生",
		"商品严格匹配@图片3：", "全片每个镜头都是同一款，不换回@视频1中原来的通勤穿搭套装",
		"衣着以@图片3中的商品和下面的分镜为准，不要换成@图片1里的衣服；@图片1只负责人物身份",
		"展示@图片3中的商品\n2–15秒：",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in\n%s", want, got)
		}
	}
	if strings.Contains(got, "第十套") || !strings.HasSuffix(got, "从第一个镜头到最后一个镜头都与图片保持一致，不随镜头切换变回@视频1中的人物和商品。）") {
		t.Fatal(got)
	}
	// A short limit keeps the whole binding and its ending; the shots shrink.
	limit := roomFor(t, got, 100)
	if short := RemakePrompt(b, Original{Duration: 15}, 15, limit, 3, swaps); runes(short) > limit || !strings.Contains(short, "脸部必须和@图片1完全一样") || !strings.Contains(short, "商品严格匹配") ||
		!strings.HasSuffix(short, "人物和商品。）") || !strings.Contains(short, "2–15秒：") {
		t.Fatal(runes(short), short)
	}
	// People only: their pictures give the clothes; nothing swapped: nothing bound.
	if got := RemakePrompt(b, Original{Duration: 15}, 15, 20000, 1, swaps[:1]); !strings.Contains(got, "服装采用@图片1中的穿着") || strings.Contains(got, "商品严格匹配") {
		t.Fatal(got)
	}
	if got := RemakePrompt(b, Original{Duration: 15}, 15, 20000, 0, nil); strings.Contains(got, "严格匹配") || strings.Contains(got, "全片要求") {
		t.Fatal(got)
	}
	if got := RemakePrompt(b, Original{Duration: 15}, 15, 20000, 2, nil); !strings.Contains(got, "换上的人物和商品在全片每一个镜头里都与图片保持一致") {
		t.Fatal(got)
	}
}

// Without a breakdown the binding is said again at the end too; a swapped
// 主体 loses its "第几个" as a product does.
func TestRemakePromptBindsWithoutABreakdownAndForOtherSubjects(t *testing.T) {
	if got := RemakePrompt(nil, Original{Title: "开箱"}, 5, 20000, 2, nil); !strings.HasSuffix(got, "不随镜头切换变回@视频1中的样子。）") {
		t.Fatal(got)
	}
	b := &vision.Breakdown{Subjects: []vision.Subject{{Name: "花瓶", Kind: "other"}}, Shots: []vision.Shot{{Start: 0, End: 3, Action: "拿起第二个【花瓶】"}}}
	if got := RemakePrompt(b, Original{Duration: 3}, 3, 20000, 1, []Swap{{Name: "花瓶", Picture: 1}}); !strings.Contains(got, "拿起@图片1中的主体") || strings.Contains(got, "第二个") {
		t.Fatal(got)
	}
}

// roomFor is a limit that holds the opening and the ending whole and leaves
// extra characters for the shots.
func roomFor(t *testing.T, whole string, extra int) int {
	t.Helper()
	shots := strings.Index(whole, "\n分镜：\n")
	if shots < 0 {
		t.Fatal("no shots in", whole)
	}
	n := runes(whole[:shots]) + runes("\n分镜：")
	if tail := strings.LastIndex(whole, "\n（全片要求"); tail >= 0 {
		n += runes(whole[tail:])
	}
	return n + extra
}
