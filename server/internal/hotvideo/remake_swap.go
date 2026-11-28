package hotvideo

import (
	"doubo/server/internal/vision"
	"fmt"
	"strings"
)

// swapHead is 生成同款's description before the shots when subjects are
// swapped, written the way a person swap holds: @视频1 fixed first (length,
// ratio, camera, framing, order and speed of the actions, setting, light),
// then only the chosen subjects replaced, and each replacement pinned from
// every side: who the person is (the picture's look), what they wear, that
// they take over every action, the props in their hands, their footing and
// framing, the light on them. Each says what must not come back from
// @视频1 or leak in from the picture.
func swapHead(b *vision.Breakdown, seconds int, swaps []Swap) string {
	cast := make([]string, len(swaps))
	var products []string
	for i, s := range swaps {
		cast[i] = "将@视频1中的" + s.Name + "替换为" + pictureOf(b, s)
		if kindOf(b, s.Name) == "person" {
			cast[i] += fmt.Sprintf("（脸部必须和@图片%d完全一样）", s.Picture)
		} else {
			products = append(products, pictureOf(b, s))
		}
	}
	paras := []string{fmt.Sprintf("参考@视频1，生成一条 %d 秒的视频：保持原视频的画面比例、机位与运镜、构图、动作顺序与速度。保留原视频的场景与环境%s，背景布局、透视关系与光线方向跟随@视频1，不增加舞台或其他特效，不新增快切、环绕或推拉镜头。仅%s；其他人物、商品和场景保持@视频1的样子。",
		seconds, placesOf(b), strings.Join(cast, "，"))}
	for _, s := range swaps {
		paras = append(paras, swapLines(b, s, products)...)
	}
	paras = append(paras,
		"手中的物品作为独立真实道具保留，不能随替换而消失或变形；握持位置、单手与双手状态、交接时机均跟随@视频1，手指自然握住，物品不粘在手上、不穿过身体。快速动作允许真实运动模糊，不能出现多余物品、残留手臂或重复身体。",
		"人物始终站在@视频1中对应的位置，双脚准确接触地面，步伐带动真实重心变化，不滑步、不漂浮。保持头身比例正常，完整保留动作所需的头顶、手臂、手中物品和脚下空间，不因替换而裁掉头部、脚部或道具。",
		"人物面部、服装和手部受光适配@视频1的光线，脚下接触阴影与环境一致，深色衣物保留层次，不糊成黑块；人物边缘与背景自然融合，无白边、光晕或生硬抠图感。",
		finish(b))
	return strings.Join(paras, "\n")
}

// swapLines pins one replacement: a person's identity, clothes and actions;
// a product's look; anything else's look and place.
func swapLines(b *vision.Breakdown, s Swap, products []string) []string {
	pic := pictureOf(b, s)
	ref := fmt.Sprintf("@图片%d", s.Picture)
	look := ""
	if l := strings.TrimRight(strings.TrimSpace(s.Look), "。."); l != "" {
		look = "（" + l + "）"
	}
	switch kindOf(b, s.Name) {
	case "person":
		clothes := "服装采用" + ref + "中的穿着，全程同一套，领口、纽扣和袖口前后一致；布料随抬臂、转身和迈步产生真实褶皱，不变回@视频1中" + s.Name + "原来的服装。" + ref + "只负责人物身份和服装，不保留图片里的背景、姿势和手势，也不作为开场画面。"
		if len(products) > 0 {
			clothes = "衣着以" + strings.Join(products, "、") + "和下面的分镜为准，不要换成" + ref + "里的衣服；" + ref + "只负责人物身份，不保留图片里的背景、姿势和手势，也不作为开场画面。"
		}
		return []string{
			"脸部必须和" + ref + "完全一样" + look + "，这是最重要的要求：以" + ref + "的脸为唯一标准，脸型与下颌线、眉形、眼型与双眼皮、鼻梁与鼻头、嘴唇形状、痣和斑点的位置、肤色都与图片一致，保留自然皮肤纹理和年龄感，发型与发际线也以" + ref + "为准；不参考@视频1中" + s.Name + "的脸，不把两张脸融合，不美颜、不磨皮、不瘦脸、不改脸型，不换成网红脸。近景、远景、侧脸、低头、转身和快速运动时都保持这张脸，全片每个镜头都是同一个人，不串回@视频1中的" + s.Name + "。表情自然、贴合画面情绪，不套用原人物的表情习惯。",
			clothes,
			pic + "接替" + s.Name + "的全部动作，动作方向、先后顺序、脚步落点、身体朝向和节奏均以@视频1为准；按自身正常身形调整动作幅度，保持灵活、利落，不刻意放慢，不额外加入摆拍。",
		}
	case "product":
		return []string{"商品严格匹配" + ref + look + "：形状、颜色、材质、包装和上面的文字图案保持一致，全片每个镜头都是同一款，不换回@视频1中原来的" + s.Name + "；大小比例、摆放位置和手持方式跟随@视频1。" + ref + "只负责商品外观，不保留图片里的背景。"}
	}
	return []string{s.Name + "替换为" + pic + look + "：外观以图片为准，全片每个镜头都保持一致，不变回@视频1中原来的样子；位置、大小和动作跟随@视频1。"}
}

// finish: the picture's feel and the voice (the lines of the shots as
// said, nothing added), no text in the frame.
func finish(b *vision.Breakdown) string {
	out := "画面质感与@视频1一致"
	if b != nil && strings.TrimSpace(b.Style) != "" {
		out += "（" + strings.TrimRight(strings.TrimSpace(b.Style), "。.") + "）"
	}
	spoken := false
	if b != nil {
		for _, s := range b.Shots {
			spoken = spoken || s.Speech != ""
		}
	}
	voice := "不新增口播、对白或字幕。"
	if spoken {
		voice = "人物台词按下面分镜里的原话，不新增其他口播、对白或字幕。"
	}
	return out + "，动作连续自然，面部稳定，画面清晰；" + voice + "不额外生成 Logo、水印或文字。"
}

// placesOf names the original's places (each shot's first phrase, up to
// 4), so the remake keeps them.
func placesOf(b *vision.Breakdown) string {
	if b == nil {
		return ""
	}
	seen, places := map[string]bool{}, []string{}
	for _, s := range b.Shots {
		place, _, _ := strings.Cut(strings.NewReplacer("【", "", "】", "").Replace(s.Scene), "，")
		if place = strings.TrimRight(strings.TrimSpace(place), "。."); place != "" && !seen[place] && runes(place) <= 20 && len(places) < 4 {
			seen[place] = true
			places = append(places, place)
		}
	}
	if len(places) == 0 {
		return ""
	}
	return "（" + strings.Join(places, "、") + "）"
}
