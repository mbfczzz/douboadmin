package settings

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func testManager(t *testing.T, base Values) *Manager {
	t.Helper()
	m := New(store.NewMemory(), filepath.Join(t.TempDir(), "keys", "integration.key"), base)
	if _, err := m.LoadStartup(t.Context()); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestEncryptedPersistenceMaskingAndRestart(t *testing.T) {
	m := testManager(t, Values{"RELAY_API_KEY": "env-private-fixture", "RELAY_BASE_URL": "https://old.example"})
	if _, err := os.Stat(m.KeyPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("read-only startup must not create a key", err)
	}
	input := Update{Values: Values{"RELAY_BASE_URL": "https://new.example", "RELAY_API_KEY": "new-private-fixture"}}
	if err := m.Save(t.Context(), "relay", "admin-a", input, true); err != nil {
		t.Fatal(err)
	}
	row, _ := m.Store.Get(t.Context(), namespace, "relay")
	if strings.Contains(string(row.Data), "private-fixture") || strings.Contains(string(row.Data), "https://new.example") {
		t.Fatal("database contains plaintext connection details")
	}
	states, err := m.States(t.Context(), true)
	if err != nil {
		t.Fatal(err)
	}
	public, _ := json.Marshal(states)
	if strings.Contains(string(public), "private-fixture") {
		t.Fatal("read API exposes credentials")
	}
	if s := states[1]; s.Source != "database" || s.Version != 1 || s.AppliedVersion != 0 || !s.PendingRestart || !s.Secrets["RELAY_API_KEY"] {
		t.Fatal("incorrect saved/restart status", s)
	}
	restarted := New(m.Store, m.KeyPath, Values{"RELAY_API_KEY": "changed-env-fixture"})
	values, err := restarted.LoadStartup(t.Context())
	if err != nil || values["RELAY_API_KEY"] != "new-private-fixture" || values["RELAY_BASE_URL"] != "https://new.example" {
		t.Fatal("restart did not use database configuration", err)
	}
	states, _ = restarted.States(t.Context(), true)
	if states[1].PendingRestart {
		t.Fatal("restart status was not cleared")
	}
	audits, err := m.Store.List(t.Context(), "integration_audit", "admin-a")
	if err != nil || len(audits) != 1 || strings.Contains(string(audits[0].Data), "private-fixture") {
		t.Fatal("audit must record actor and field names without values", err)
	}
}

func TestBlankKeepsSecretAndExplicitClearOverridesEnvironment(t *testing.T) {
	m := testManager(t, Values{"RELAY_API_KEY": "environment-secret-fixture"})
	for version, value := range []string{"", "   "} {
		if err := m.Save(t.Context(), "relay", "admin", Update{Version: int64(version), Values: Values{"RELAY_API_KEY": value}}, false); err != nil {
			t.Fatal(err)
		}
	}
	values, err := New(m.Store, m.KeyPath, nil).LoadStartup(t.Context())
	if err != nil || values["RELAY_API_KEY"] != "environment-secret-fixture" {
		t.Fatal("blank secret must preserve the existing value", err)
	}
	if err = m.Save(t.Context(), "relay", "admin", Update{Version: 2, Clear: []string{"RELAY_API_KEY"}}, false); err != nil {
		t.Fatal(err)
	}
	values, err = New(m.Store, m.KeyPath, Values{"RELAY_API_KEY": "fallback-must-not-return"}).LoadStartup(t.Context())
	if err != nil || values["RELAY_API_KEY"] != "" {
		t.Fatal("explicitly cleared secret fell back to environment", err)
	}
}

func TestConcurrentSavesUseVersionAndAtomicAudit(t *testing.T) {
	m := testManager(t, nil)
	var success, conflict atomic.Int32
	var group sync.WaitGroup
	for range 8 {
		group.Go(func() {
			err := m.Save(t.Context(), "relay", "admin", Update{Values: Values{"RELAY_API_KEY": "concurrent-fixture"}}, false)
			if err == nil {
				success.Add(1)
			} else if errors.Is(err, core.ErrConflict) {
				conflict.Add(1)
			} else {
				t.Error(err)
			}
		})
	}
	group.Wait()
	rows, err := m.Store.List(t.Context(), "integration_audit", "")
	if success.Load() != 1 || conflict.Load() != 7 || err != nil || len(rows) != 1 {
		t.Fatal("stale saves overwrote a newer version or leaked audits", success.Load(), conflict.Load(), err)
	}
}
