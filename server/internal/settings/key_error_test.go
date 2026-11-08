package settings

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestKeyDirectoryFailureExplainsFilesystemAndServicePermissions(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "regular-file")
	if err := os.WriteFile(blocker, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	err := createKey(filepath.Join(blocker, "nested", "integrations.key"))
	var key *KeyFileError
	if !errors.As(err, &key) || !strings.Contains(key.Error(), "MEDIA_DIR") || !strings.Contains(key.Error(), "ReadWritePaths") {
		t.Fatal("directory failure did not provide safe operator guidance", err)
	}
	if strings.Contains(key.Error(), blocker) {
		t.Fatal("raw filesystem error leaked into the operator message")
	}
}
