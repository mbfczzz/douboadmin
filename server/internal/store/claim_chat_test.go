package store

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"os"
	"testing"
	"time"
)

// Chat workers take only chat turns; an older image job is left for others.
func claimChat(t *testing.T, s Store) {
	t.Helper()
	ctx := t.Context()
	user := "claim-" + core.NewID()[:8]
	img := core.NewJob(user, core.NewID(), core.JobInput{Kind: "image", Prompt: "p", Assets: []string{}})
	img.CreatedAt = time.Now().Add(-time.Hour)
	chat := core.NewJob(user, core.NewID(), core.JobInput{Kind: "chat", Prompt: "p", Assets: []string{}})
	for _, j := range []core.Job{img, chat} {
		if _, err := s.CreateJob(ctx, j); err != nil {
			t.Fatal(err)
		}
	}
	for {
		j, err := s.ClaimChat(ctx)
		if errors.Is(err, core.ErrNotFound) {
			t.Fatal("the chat turn was not claimed")
		}
		if err != nil {
			t.Fatal(err)
		}
		if j.Input.Kind != "chat" {
			t.Fatal("a chat worker took", j.Input.Kind)
		}
		if j.ID == chat.ID {
			break // (on a shared MySQL test database, older chat turns may come first)
		}
	}
}

func TestClaimChatMemory(t *testing.T) { claimChat(t, NewMemory()) }

func TestClaimChatMySQL(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEMP_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEMP_TEST_DSN enables the SQL check")
	}
	m, err := NewMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	if err = m.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	claimChat(t, m)
}
