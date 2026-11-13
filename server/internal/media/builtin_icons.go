package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type IconObjects interface {
	EnsureIcon(context.Context, string, io.Reader) error
	IconURL(context.Context, string) (string, error)
}

// BuiltinIcons publishes built-in PNGs, independently of user uploads.
// Entries become available to /config only after OSS confirms the object exists.
type BuiltinIcons struct {
	dir       string
	namespace string
	maxBytes  int
	objects   IconObjects
	mu        sync.RWMutex
	keys      map[string]string
}

func NewModelIcons(dir string, objects IconObjects) *BuiltinIcons {
	return newBuiltinIcons(dir, "model-icons", 128*1024, objects)
}

func NewBrandIcons(dir string, objects IconObjects) *BuiltinIcons {
	return newBuiltinIcons(dir, "brand", 2*1024*1024, objects)
}

func newBuiltinIcons(dir, namespace string, maxBytes int, objects IconObjects) *BuiltinIcons {
	return &BuiltinIcons{dir: dir, namespace: namespace, maxBytes: maxBytes, objects: objects, keys: make(map[string]string)}
}

func (m *BuiltinIcons) Sync(ctx context.Context) (int, error) {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return 0, err
	}
	count := 0
	var failures []error
	for _, entry := range entries {
		if !entry.Type().IsRegular() || filepath.Ext(entry.Name()) != ".png" {
			continue
		}
		if err := ctx.Err(); err != nil {
			return count, errors.Join(append(failures, err)...)
		}
		if err := m.syncIcon(ctx, entry.Name()); err != nil {
			failures = append(failures, err)
			continue
		}
		count++
	}
	if count == 0 && len(failures) == 0 {
		return 0, fmt.Errorf("no built-in icons found")
	}
	return count, errors.Join(failures...)
}

func (m *BuiltinIcons) syncIcon(ctx context.Context, name string) error {
	data, err := os.ReadFile(filepath.Join(m.dir, name))
	if err != nil {
		return err
	}
	if len(data) > m.maxBytes {
		return fmt.Errorf("built-in icon too large: %s", name)
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width == 0 || config.Height == 0 {
		return fmt.Errorf("invalid built-in icon: %s", name)
	}
	key := fmt.Sprintf("system/%s/%x/%s", m.namespace, sha256.Sum256(data), name)
	if err := m.objects.EnsureIcon(ctx, key, bytes.NewReader(data)); err != nil {
		return err
	}
	m.mu.Lock()
	m.keys["/media/"+m.namespace+"/"+name] = key
	m.mu.Unlock()
	return nil
}

func (m *BuiltinIcons) URL(ctx context.Context, icon string) string {
	if !strings.HasPrefix(icon, "/media/"+m.namespace+"/") {
		return icon
	}
	m.mu.RLock()
	key := m.keys[icon]
	m.mu.RUnlock()
	if key != "" {
		if url, err := m.objects.IconURL(ctx, key); err == nil && strings.HasPrefix(url, "https://") {
			return url
		}
	}
	return icon
}

// URLs snapshots confirmed uploads without holding the lock while signing.
// Failed signatures are omitted; this never uploads or exposes local fallbacks.
func (m *BuiltinIcons) URLs(ctx context.Context) map[string]string {
	m.mu.RLock()
	keys := make(map[string]string, len(m.keys))
	for path, key := range m.keys {
		keys[path] = key
	}
	m.mu.RUnlock()
	urls := make(map[string]string, len(keys))
	for path, key := range keys {
		if ctx.Err() != nil {
			break
		}
		if url, err := m.objects.IconURL(ctx, key); err == nil && strings.HasPrefix(url, "https://") {
			urls[path] = url
		}
	}
	return urls
}
