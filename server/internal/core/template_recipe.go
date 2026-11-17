package core

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const MaxTemplatePromptChars = 20000
const MaxTemplateImageSlots = 16

type TemplateImageSlot struct {
	Label    string `json:"label"`
	Optional bool   `json:"optional"`
}

var templateImageToken = regexp.MustCompile(`\{\{image:([1-9][0-9]*)\}\}`)
var numberedImageReference = regexp.MustCompile(`@?图(?:片)?\s*[0-9]+`)

const templateReferenceIntro = "【本次参考素材对应关系】\n只按下列实际上传顺序读取图片；未上传的素材不能用其他图片顶替，正文中的缺图条件按未提供处理。\n"

func (t Template) AllowsModel(id string) bool {
	if t.Model == id {
		return true
	}
	for _, candidate := range t.SelectableModels {
		if candidate == id {
			return true
		}
	}
	return false
}

func (t Template) ValidateRecipe() error {
	if len(t.SelectableModels) > 40 || utf8.RuneCountInString(t.InputHint) > 1024 {
		return fmt.Errorf("模板模型数量或上传说明过长")
	}
	if len(t.ImageSlots) == 0 {
		if t.RequiredImages < 0 || t.RequiredImages > 5 {
			return fmt.Errorf("必填图片数量无效")
		}
		return nil
	}
	if len(t.ImageSlots) > MaxTemplateImageSlots {
		return fmt.Errorf("模板最多支持 %d 个图片位置", MaxTemplateImageSlots)
	}
	required, optional := 0, false
	for _, slot := range t.ImageSlots {
		if strings.TrimSpace(slot.Label) == "" || utf8.RuneCountInString(slot.Label) > 80 {
			return fmt.Errorf("图片用途名称不能为空且不能超过 80 字")
		}
		if slot.Optional {
			optional = true
		} else {
			required++
		}
	}
	if required == 0 || required != t.RequiredImages {
		return fmt.Errorf("必填图片数量与用途位置不一致")
	}
	for _, match := range templateImageToken.FindAllStringSubmatch(t.Prompt, -1) {
		n, err := strconv.Atoi(match[1])
		if err != nil || n < 1 || n > len(t.ImageSlots) {
			return fmt.Errorf("提示词引用了不存在的图片位置 %d", n)
		}
	}
	remaining := templateImageToken.ReplaceAllString(t.Prompt, "")
	if strings.Contains(remaining, "{{image:") || optional && numberedImageReference.MatchString(remaining) {
		return fmt.Errorf("含选填图片的提示词请使用 {{image:1}} 形式绑定图片用途")
	}
	return nil
}

func (t Template) ResolveImages(slots []int) (string, error) {
	positions := map[int]int{}
	for i, slot := range slots {
		if slot < 1 || slot > len(t.ImageSlots) || positions[slot] != 0 {
			return "", fmt.Errorf("图片位置无效或重复，请重新上传")
		}
		positions[slot] = i + 1
	}
	for i, slot := range t.ImageSlots {
		if !slot.Optional && positions[i+1] == 0 {
			return "", fmt.Errorf("请上传%s", slot.Label)
		}
	}
	if !templateImageToken.MatchString(t.Prompt) {
		return t.Prompt, nil
	}
	var intro strings.Builder
	intro.WriteString(templateReferenceIntro)
	for i, slot := range t.ImageSlots {
		if position := positions[i+1]; position > 0 {
			fmt.Fprintf(&intro, "%s：@图%d（实际第%d张图片）。\n", slot.Label, position, position)
		} else {
			fmt.Fprintf(&intro, "%s：未上传，不作为本次参考。\n", slot.Label)
		}
	}
	prompt := templateImageToken.ReplaceAllStringFunc(t.Prompt, func(token string) string {
		match := templateImageToken.FindStringSubmatch(token)
		slot, _ := strconv.Atoi(match[1])
		if position := positions[slot]; position > 0 {
			return fmt.Sprintf("@图%d", position)
		}
		return "【未上传的" + t.ImageSlots[slot-1].Label + "】"
	})
	return intro.String() + "\n" + prompt, nil
}

// Bound every selection without enumerating all combinations of optional slots.
func (t Template) ExpandedPromptChars() int {
	if !templateImageToken.MatchString(t.Prompt) {
		return utf8.RuneCountInString(t.Prompt)
	}
	n := max(1, len(t.ImageSlots))
	count := utf8.RuneCountInString(templateReferenceIntro) + 1
	for _, slot := range t.ImageSlots {
		present := utf8.RuneCountInString(fmt.Sprintf("%s：@图%d（实际第%d张图片）。\n", slot.Label, n, n))
		if slot.Optional {
			present = max(present, utf8.RuneCountInString(fmt.Sprintf("%s：未上传，不作为本次参考。\n", slot.Label)))
		}
		count += present
	}
	prompt := templateImageToken.ReplaceAllStringFunc(t.Prompt, func(token string) string {
		match := templateImageToken.FindStringSubmatch(token)
		i, _ := strconv.Atoi(match[1])
		present := fmt.Sprintf("@图%d", n)
		missing := "【未上传的" + t.ImageSlots[i-1].Label + "】"
		if t.ImageSlots[i-1].Optional && utf8.RuneCountInString(missing) > utf8.RuneCountInString(present) {
			return missing
		}
		return present
	})
	return count + utf8.RuneCountInString(prompt)
}
