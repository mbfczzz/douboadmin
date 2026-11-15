package core

import (
	"testing"
	"time"
)

func TestGenerationTimeoutBoundariesUseCreationTime(t *testing.T) {
	now := time.Now().UTC()
	for _, tt := range []struct {
		kind  string
		limit time.Duration
	}{{"image", 10 * time.Minute}, {"video", time.Hour}, {"mix", time.Hour}, {"chat", 0}, {"audio", 0}, {"import", 0}} {
		j := Job{CreatedAt: now, Input: JobInput{Kind: tt.kind}}
		if JobTimeLimit(tt.kind) != tt.limit {
			t.Fatal(tt)
		}
		if tt.limit == 0 {
			if JobExpired(j, now.Add(24*time.Hour)) {
				t.Fatal("unrelated job expired")
			}
			continue
		}
		if JobExpired(j, now.Add(tt.limit-time.Nanosecond)) || !JobExpired(j, now.Add(tt.limit)) {
			t.Fatal("deadline boundary wrong", tt)
		}
		j.UpdatedAt = now.Add(tt.limit)
		if !JobExpired(j, now.Add(tt.limit)) {
			t.Fatal("polling extended deadline")
		}
	}
	if JobExpired(Job{Input: JobInput{Kind: "image"}}, now) {
		t.Fatal("zero creation time expired")
	}
}
