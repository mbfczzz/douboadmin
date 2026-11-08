package settings

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"sync"
	"testing"
)

// Simulates another administrator saving between two nontransactional reads.
type movingSettingsStore struct {
	store.Store
	once   sync.Once
	change func()
}

func (s *movingSettingsStore) Get(ctx context.Context, namespace, id string) (core.Record, error) {
	row, err := s.Store.Get(ctx, namespace, id)
	if namespace == "integration_settings" && id == "wechat" {
		s.once.Do(s.change)
	}
	return row, err
}

func TestStartupDoesNotMixConfigurationsAcrossConcurrentSaves(t *testing.T) {
	m := testManager(t, nil)
	if err := m.Save(t.Context(), "wechat", "admin", Update{Values: Values{"WECHAT_APP_SECRET": "before-fixture"}}, false); err != nil {
		t.Fatal(err)
	}
	if err := m.Save(t.Context(), "virtual", "admin", Update{Values: Values{"WECHAT_VIRTUAL_OFFER_ID": "before-offer"}}, false); err != nil {
		t.Fatal(err)
	}
	concurrent := &movingSettingsStore{Store: m.Store, change: func() {
		if err := m.Save(t.Context(), "wechat", "other-admin", Update{Version: 1, Values: Values{"WECHAT_APP_SECRET": "after-fixture"}}, false); err != nil {
			t.Fatal(err)
		}
		if err := m.Save(t.Context(), "virtual", "other-admin", Update{Version: 1, Values: Values{"WECHAT_VIRTUAL_OFFER_ID": "after-offer"}}, false); err != nil {
			t.Fatal(err)
		}
	}}
	reader := New(concurrent, m.KeyPath, nil)
	values, err := reader.LoadStartup(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	before := values["WECHAT_APP_SECRET"] == "before-fixture" && values["WECHAT_VIRTUAL_OFFER_ID"] == "before-offer"
	after := values["WECHAT_APP_SECRET"] == "after-fixture" && values["WECHAT_VIRTUAL_OFFER_ID"] == "after-offer"
	if !before && !after {
		t.Fatal("startup mixed credential snapshots from different saves")
	}
}
