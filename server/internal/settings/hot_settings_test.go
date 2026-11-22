package settings

import (
	"doubo/server/internal/core"
	"errors"
	"testing"
)

func TestThirdPartyResourceSettingsAreVisibleAndPersistAcrossRestart(t *testing.T) {
	m := testManager(t, Values{"TIKHUB_API_KEY": "file-key", "HOT_FEED_SOURCE": "billboard", "HOT_CACHE_VIDEO_MINUTES": "45"})
	states, err := m.States(t.Context(), true)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, s := range states {
		if s.ID == "hot" {
			found = s.Name == "第三方资源配置" && s.Source == "environment" && s.Secrets["TIKHUB_API_KEY"] && len(s.Fields) == 8
		}
	}
	if !found {
		t.Fatal("resource group missing, renamed ID or incomplete fields")
	}
	update := Update{Values: Values{"TIKHUB_API_KEY": "console-key", "HOT_FEED_SOURCE": "search", "HOT_FEED_KEYWORDS": "剧情带货,探店", "HOT_CACHE_FEED_MINUTES": "120"}}
	if err := m.Save(t.Context(), "hot", "admin", update, true); err != nil {
		t.Fatal(err)
	}
	if err := m.Save(t.Context(), "hot", "admin", update, true); !errors.Is(err, core.ErrConflict) {
		t.Fatal("stale save was accepted", err)
	}
	if err := m.Save(t.Context(), "hot", "admin", Update{Version: 1, Values: Values{"TIKHUB_API_KEY": ""}}, true); err != nil {
		t.Fatal(err)
	}
	values, err := New(m.Store, m.KeyPath, Values{"TIKHUB_API_KEY": "changed-file-key"}).LoadStartup(t.Context())
	if err != nil || values["TIKHUB_API_KEY"] != "console-key" || values["HOT_FEED_SOURCE"] != "search" || values["HOT_CACHE_FEED_MINUTES"] != "120" || values["HOT_CACHE_VIDEO_MINUTES"] != "45" {
		t.Fatal("saved resource values not applied after restart", err)
	}
	if err := m.Save(t.Context(), "hot", "admin", Update{Version: 2, Clear: []string{"TIKHUB_API_KEY"}}, true); err != nil {
		t.Fatal(err)
	}
	values, err = New(m.Store, m.KeyPath, Values{"TIKHUB_API_KEY": "must-not-return"}).LoadStartup(t.Context())
	if err != nil || values["TIKHUB_API_KEY"] != "" {
		t.Fatal("cleared resource key fell back to the environment", err)
	}
}

func TestThirdPartyResourceOldHotEnvelopeIsStillReadable(t *testing.T) {
	m := testManager(t, nil)
	key, err := m.encryptionKey(false)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := seal("hot", Values{"TIKHUB_API_KEY": "old-console-key", "TIKHUB_BASE_URL": "https://old.example"}, key)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m.Store.Put(t.Context(), namespace, core.Record{ID: "hot", Data: raw}, 0); err != nil {
		t.Fatal(err)
	}
	values, err := New(m.Store, m.KeyPath, Values{"TIKHUB_API_KEY": "file-key"}).LoadStartup(t.Context())
	if err != nil || values["TIKHUB_API_KEY"] != "old-console-key" || values["HOT_FEED_SOURCE"] != "search" || values["HOT_CACHE_FEED_MINUTES"] != "1440" {
		t.Fatal("legacy group id/encryption compatibility was lost", err)
	}
}

func TestHotProblemFlagsInvalidEffectiveSettings(t *testing.T) {
	if err := HotProblem(Environment()); err != nil {
		t.Fatal("defaults flagged", err)
	}
	for _, bad := range []Values{
		{"HOT_CACHE_VIDEO_MINUTES": "9999"},
		{"TIKHUB_BASE_URL": "invalid"},
		{"TIKHUB_BASE_URL": "", "TIKHUB_API_KEY": "fixture"},
		{"HOT_FEED_SOURCE": "unknown"},
		{"HOT_FEED_KEYWORDS": "这个关键词的长度已经超过二十个汉字的最大限制"},
	} {
		if HotProblem(bad) == nil {
			t.Fatal("invalid resource settings accepted")
		}
	}
}
