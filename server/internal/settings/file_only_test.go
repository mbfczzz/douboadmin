package settings

import (
	"doubo/server/internal/core"
	"errors"
	"testing"
)

// 热门视频接口 is set only in the environment file: the admin console neither
// lists nor saves it, and a copy saved there earlier no longer applies.
func TestFileOnlyGroupIsHiddenAndReadFromTheFile(t *testing.T) {
	m := testManager(t, Values{"TIKHUB_API_KEY": "file-key", "HOT_FEED_SOURCE": "billboard"})
	// An earlier console save (unreadable on purpose: it must not be opened).
	if _, err := m.Store.Put(t.Context(), namespace, core.Record{ID: "hot", Data: []byte(`{"format":99,"keyId":"gone","ciphertext":"x"}`)}, 0); err != nil {
		t.Fatal(err)
	}
	states, err := m.States(t.Context(), true)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range states {
		if s.ID == "hot" {
			t.Fatal("hot group shown in the admin console")
		}
	}
	update := Update{Values: Values{"TIKHUB_API_KEY": "console-key"}}
	if err := m.Save(t.Context(), "hot", "admin", update, true); !errors.Is(err, core.ErrNotFound) {
		t.Fatal("hot group saved from the console", err)
	}
	values, err := New(m.Store, m.KeyPath, Values{"TIKHUB_API_KEY": "file-key", "HOT_FEED_SOURCE": "billboard"}).LoadStartup(t.Context())
	if err != nil || values["TIKHUB_API_KEY"] != "file-key" || values["HOT_FEED_SOURCE"] != "billboard" || values["HOT_CACHE_FEED_MINUTES"] != "1440" {
		t.Fatal("file values not used", err, values)
	}
}

func TestFileOnlyProblemFlagsBadFileValues(t *testing.T) {
	if err := FileOnlyProblem(Environment()); err != nil {
		t.Fatal("defaults flagged", err)
	}
	if FileOnlyProblem(Values{"HOT_CACHE_VIDEO_MINUTES": "9999"}) == nil {
		t.Fatal("out-of-range cache minutes not flagged")
	}
}
