package settings

import (
	"path/filepath"
	"testing"

	"doubo/server/internal/store"
)

func TestSealedSecretsOpenOnlyForTheirPurpose(t *testing.T) {
	m := New(store.NewMemory(), filepath.Join(t.TempDir(), "key"), nil)
	sealed, err := m.SealSecret("login/p1", "Kp7sQ2mXv9TnR4wLb8Hc")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := m.OpenSecret("login/p1", sealed); err != nil || got != "Kp7sQ2mXv9TnR4wLb8Hc" {
		t.Fatal(got, err)
	}
	if _, err = m.OpenSecret("login/p2", sealed); err == nil {
		t.Fatal("a secret opened for another purpose")
	}
}
