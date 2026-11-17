package core

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func recipeFixture() Template {
	return Template{RequiredImages: 2, Prompt: "主体 {{image:1}}，选填 {{image:2}}，商品 {{image:3}}", ImageSlots: []TemplateImageSlot{
		{Label: "主体"}, {Label: "场景", Optional: true}, {Label: "商品"},
	}}
}

func TestRecipeOmittedOptionalImageNeverShiftsRequiredImage(t *testing.T) {
	template := recipeFixture()
	if err := template.ValidateRecipe(); err != nil {
		t.Fatal(err)
	}
	prompt, err := template.ResolveImages([]int{3, 1})
	if err != nil || !strings.Contains(prompt, "主体 @图2，选填 【未上传的场景】，商品 @图1") {
		t.Fatal(prompt, err)
	}
	for _, slots := range [][]int{{1}, {1, 1, 3}, {0, 1, 3}, {1, 3, 4}} {
		if _, err := template.ResolveImages(slots); err == nil {
			t.Fatal("invalid slots accepted", slots)
		}
	}
	if utf8.RuneCountInString(prompt) > template.ExpandedPromptChars() {
		t.Fatal("expanded prompt bound is too small")
	}
}

func TestRecipeRejectsInvalidMetadataAndUnboundReferences(t *testing.T) {
	for _, mutate := range []func(*Template){
		func(t *Template) { t.Prompt = "{{image:0}}" },
		func(t *Template) { t.Prompt = "{{image:99}}" },
		func(t *Template) { t.Prompt = "{{image:9999999999999999999999999999999}}" },
		func(t *Template) { t.Prompt = "图1和{{image:3}}" },
		func(t *Template) { t.RequiredImages = 3 },
		func(t *Template) { t.ImageSlots[0].Label = "" },
		func(t *Template) { t.ImageSlots = make([]TemplateImageSlot, 17) },
	} {
		template := recipeFixture()
		mutate(&template)
		if err := template.ValidateRecipe(); err == nil {
			t.Fatal("invalid metadata accepted", template)
		}
	}
}

func TestRecipePromptBoundCoversEveryOptionalCombination(t *testing.T) {
	template := recipeFixture()
	template.ImageSlots = append(template.ImageSlots, TemplateImageSlot{Label: strings.Repeat("可选用途", 12), Optional: true})
	template.Prompt += " {{image:4}} {{image:4}}"
	for _, slots := range [][]int{{1, 3}, {1, 2, 3}, {1, 3, 4}, {1, 2, 3, 4}} {
		prompt, err := template.ResolveImages(slots)
		if err != nil || utf8.RuneCountInString(prompt) > template.ExpandedPromptChars() {
			t.Fatal("bound failed", slots, err)
		}
	}
}

func TestTemplateAcceptsAnyModelFittingDurationRatioAndMode(t *testing.T) {
	tpl := Template{Kind: "video", ImageSlots: []TemplateImageSlot{{Label: "人物"}}}
	tpl.Duration, tpl.Ratio, tpl.Mode = 30, "9:16", "i2v"
	fit := Model{ID: "other", Kind: "video", Available: true, Published: true, Durations: []int{15, 30}, Ratios: []string{"9:16"}, Modes: []string{"t2v", "omni_ref"}, ReferenceTypes: []string{"image"}}
	if !tpl.AcceptsModel(fit) {
		t.Fatal("unlisted model supporting 30 s and 全能参考 was refused")
	}
	for name, m := range map[string]Model{
		"15 s only":  {ID: "a", Kind: "video", Available: true, Published: true, Durations: []int{15}, Modes: []string{"omni_ref"}, ReferenceTypes: []string{"image"}},
		"no images":  {ID: "b", Kind: "video", Available: true, Published: true, Durations: []int{30}, Modes: []string{"omni_ref"}},
		"wrong mode": {ID: "c", Kind: "video", Available: true, Published: true, Durations: []int{30}, Modes: []string{"t2v"}, ReferenceTypes: []string{"image"}},
		"16:9 only":  {ID: "d", Kind: "video", Available: true, Published: true, Durations: []int{30}, Ratios: []string{"16:9"}, Modes: []string{"omni_ref"}, ReferenceTypes: []string{"image"}},
	} {
		if tpl.AcceptsModel(m) {
			t.Fatal("accepted model that cannot run the template:", name)
		}
	}
}
