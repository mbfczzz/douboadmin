package settings

import (
	"bytes"
	"doubo/server/internal/core"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestExistingSettingsRequireOriginalKey(t *testing.T) {
	m := testManager(t, nil)
	if err := m.Save(t.Context(), "relay", "admin", Update{Values: Values{"RELAY_API_KEY": "fixture"}}, false); err != nil {
		t.Fatal(err)
	}
	key, _ := os.ReadFile(m.KeyPath)
	if err := os.Remove(m.KeyPath); err != nil {
		t.Fatal(err)
	}
	assertRefusesSave := func() {
		t.Helper()
		if err := m.Save(t.Context(), "relay", "admin", Update{Version: 1, Values: Values{"RELAY_API_KEY": "must-not-save"}}, false); err == nil {
			t.Fatal("running process saved configuration without the original key file")
		}
		row, err := m.Store.Get(t.Context(), namespace, "relay")
		if err != nil || row.Version != 1 {
			t.Fatal("failed save changed configuration", err)
		}
	}
	assertRefusesSave()
	if _, err := New(m.Store, m.KeyPath, nil).LoadStartup(t.Context()); err == nil {
		t.Fatal("missing key silently generated a replacement")
	}
	if _, err := os.Stat(m.KeyPath); !os.IsNotExist(err) {
		t.Fatal("missing original key must not be replaced")
	}
	if err := createKey(m.KeyPath); err != nil {
		t.Fatal(err)
	}
	assertRefusesSave()
	if _, err := New(m.Store, m.KeyPath, nil).LoadStartup(t.Context()); err == nil {
		t.Fatal("wrong key silently fell back to environment")
	}
	if err := os.WriteFile(m.KeyPath, key, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := New(m.Store, m.KeyPath, nil).LoadStartup(t.Context()); err != nil {
		t.Fatal("restoring original key did not recover settings", err)
	}
	if err := m.Save(t.Context(), "relay", "admin", Update{Version: 1}, false); err != nil {
		t.Fatal("running process did not recover after original key restoration", err)
	}
}

func TestCiphertextAuthenticatesContentsAndGroup(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	raw, err := seal("relay", Values{"RELAY_API_KEY": "fixture"}, key)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = open("oss", raw, key); err == nil {
		t.Fatal("ciphertext moved to another group was accepted")
	}
	var saved envelope
	_ = json.Unmarshal(raw, &saved)
	saved.Data = "AAAA" + saved.Data[4:]
	if _, err = open("relay", core.Data(saved), key); err == nil {
		t.Fatal("tampered ciphertext was accepted")
	}
	next, _ := seal("relay", Values{"RELAY_API_KEY": "fixture"}, key)
	if bytes.Equal(next, raw) {
		t.Fatal("encryption reused a nonce")
	}
}

func TestSimultaneousKeyCreationUsesOneCompleteFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "shared", "key")
	keys := make(chan []byte, 8)
	var workers sync.WaitGroup
	for range 8 {
		workers.Go(func() {
			key, err := loadKey(path, false)
			if err != nil {
				t.Error(err)
				return
			}
			keys <- key
		})
	}
	workers.Wait()
	close(keys)
	first := <-keys
	for key := range keys {
		if !bytes.Equal(key, first) {
			t.Fatal("API and Worker observed different keys")
		}
	}
}
