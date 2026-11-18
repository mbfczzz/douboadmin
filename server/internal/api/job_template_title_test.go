package api

import (
	"context"
	"doubo/server/internal/core"
	"testing"
)

// Template jobs have no user prompt to title them; the queue shows the
// template's name instead of 未命名任务.
func TestPresentedTemplateJobCarriesTemplateTitle(t *testing.T) {
	a, _, _ := setup(t)
	tpl := core.Template{Title: "W01 社区日常综合宣传", ImageSlots: []core.TemplateImageSlot{{Label: "场景"}}}
	if _, err := a.Store.Put(context.Background(), "templates", core.Record{ID: "tpl", Data: core.Data(tpl)}, 0); err != nil {
		t.Fatal(err)
	}
	j := core.NewJob("u", "k", core.JobInput{Kind: "video", Prompt: "私有配方", TemplateID: "tpl"})
	a.presentJob(context.Background(), &j)
	if j.TemplateTitle != tpl.Title || j.Input.Prompt != "" {
		t.Fatal("template job not titled or recipe exposed", j.TemplateTitle, j.Input.Prompt)
	}
	plain := core.NewJob("u", "k2", core.JobInput{Kind: "video", Prompt: "自己写的"})
	a.presentJob(context.Background(), &plain)
	if plain.TemplateTitle != "" || plain.Input.Prompt != "自己写的" {
		t.Fatal("plain job changed", plain.TemplateTitle, plain.Input.Prompt)
	}
}
