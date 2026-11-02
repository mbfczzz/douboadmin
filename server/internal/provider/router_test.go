package provider

import (
	"context"
	"doubo/server/internal/core"
	"testing"
)

type countedProvider struct{ calls int }

func (p *countedProvider) Generate(context.Context, core.Job) (string, error) {
	p.calls++
	return "result", nil
}

func TestRouterNeverSendsRetiredOrUnknownJobsToRelay(t *testing.T) {
	ai := &countedProvider{}
	router := Router{AI: ai}
	for _, kind := range []string{"mix", "unknown", ""} {
		if _, err := router.Generate(context.Background(), core.Job{Input: core.JobInput{Kind: kind}}); err == nil {
			t.Fatalf("unsupported job %q accepted", kind)
		}
	}
	if ai.calls != 0 {
		t.Fatal("unsupported job reached upstream")
	}
	for _, kind := range []string{"image", "video", "chat", "audio"} {
		if _, err := router.Generate(context.Background(), core.Job{Input: core.JobInput{Kind: kind}}); err != nil {
			t.Fatal(kind, err)
		}
	}
	if ai.calls != 4 {
		t.Fatal("supported generation stopped working")
	}
}
