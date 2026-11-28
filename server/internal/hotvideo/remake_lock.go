package hotvideo

import (
	"doubo/server/internal/vision"
	"strings"
)

// A long remake follows @视频1 cut by cut, and at each cut the model drifts
// back to the original people and products: only the first shots keep the
// pictures. So the swaps are bound to every shot, before the shots and once
// more after them, and a person's picture gives only the face when a product
// picture gives what is worn (or the person pictures' own outfits mix in).
func lockRules(b *vision.Breakdown, images int, swaps []Swap) (head, tail string) {
	people, things := []string{}, []string{}
	for _, s := range swaps {
		if kindOf(b, s.Name) == "person" {
			people = append(people, pictureOf(b, s))
		} else {
			things = append(things, pictureOf(b, s))
		}
	}
	if len(swaps) == 0 && images > 0 {
		return "换上的人物和商品在全片每一个镜头里都与图片保持一致，切换镜头后不能变回@视频1中的样子。",
			"（全片要求：换上的人物和商品从第一个镜头到最后一个镜头都与图片一致，不随镜头切换变回@视频1中的样子。）"
	}
	all := append(append([]string{}, people...), things...)
	if len(all) == 0 {
		return "", ""
	}
	if len(people) > 0 {
		head += "人物身份严格匹配：" + strings.Join(people, "、") + "在全片每一个镜头里都是图片中的同一个人，面部五官、发型和肤色始终不变；切换镜头、换装、转身或侧脸后，也绝不能变回@视频1中的原人物。"
	}
	if len(things) > 0 {
		head += "主体严格匹配：" + strings.Join(things, "、") + "在全片每一个镜头里都保持图片中的同一款，颜色、材质、款式和细节始终不变，不能换回@视频1中原来的样子。"
	}
	if len(people) > 0 && len(things) > 0 {
		head += "人物图片只用来确定长相和发型；衣着以" + strings.Join(things, "、") + "和下面的分镜为准，不要换成人物图片里的衣服。"
	}
	face := ""
	if len(people) > 0 {
		face = strings.Join(people, "、") + "的脸在每一个镜头都和图片完全一样，"
	}
	return head, "（全片要求：" + face + strings.Join(all, "、") + "从第一个镜头到最后一个镜头都与图片保持一致，不随镜头切换变回@视频1中的人物和商品。）"
}

func kindOf(b *vision.Breakdown, name string) string {
	if b != nil {
		for _, s := range b.Subjects {
			if s.Name == name {
				return s.Kind
			}
		}
	}
	return "other"
}

// SubjectKind is the breakdown's kind of a subject (person, product, other).
func SubjectKind(b *vision.Breakdown, name string) string { return kindOf(b, name) }
