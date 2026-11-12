package settings

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"sync"
)

const namespace = "integration_settings"

type Manager struct {
	Store   store.Store
	KeyPath string
	base    Values
	mu      sync.Mutex
	key     []byte
	applied map[string]int64
}

func New(s store.Store, keyPath string, base Values) *Manager {
	values := Values{}
	for _, g := range definitions {
		for key, value := range defaults(g) {
			values[key] = value
		}
	}
	for key, value := range base {
		values[key] = value
	}
	return &Manager{Store: s, KeyPath: keyPath, base: values, applied: map[string]int64{}}
}

func (m *Manager) encryptionKey(required bool) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key, err := loadKey(m.KeyPath, required || len(m.key) != 0)
	if err == nil && len(m.key) != 0 && !bytes.Equal(key, m.key) {
		return nil, keyFileError("接入配置加密密钥已被替换，请恢复原密钥文件")
	}
	if err == nil {
		m.key = key
	}
	return key, err
}

type reader interface {
	Get(string, string) (core.Record, error)
}

func (m *Manager) snapshot(ctx context.Context) (values Values, records map[string]core.Record, err error) {
	err = m.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, e := tx.Lock("settings_control", core.Record{ID: "integrations", Data: core.Data(map[string]string{})}); e != nil {
			return e
		}
		values, records, err = m.resolve(tx)
		return err
	})
	return
}

func (m *Manager) resolve(r reader) (Values, map[string]core.Record, error) {
	values := Values{}
	records := map[string]core.Record{}
	for _, g := range definitions {
		row, err := r.Get(namespace, g.ID)
		if errors.Is(err, core.ErrNotFound) {
			for _, field := range g.Fields {
				values[field.Key] = m.base[field.Key]
			}
			continue
		}
		if err != nil {
			return nil, nil, err
		}
		key, err := m.encryptionKey(true)
		if err != nil {
			return nil, nil, err
		}
		stored, err := open(g.ID, row.Data, key)
		if err != nil {
			return nil, nil, err
		}
		records[g.ID] = row
		for _, field := range g.Fields {
			value, ok := stored[field.Key]
			if !ok {
				value = field.Default
			}
			values[field.Key] = value // An explicitly cleared secret must never fall back to ENV.
		}
	}
	normalizeSMS(values)
	return values, records, nil
}

// LoadStartup freezes one configuration version for this API/Worker process.
func (m *Manager) LoadStartup(ctx context.Context) (Values, error) {
	values, records, err := m.snapshot(ctx)
	if err != nil {
		return nil, err
	}
	if flag := values["SMS_VERIFICATION_ENABLED"]; flag != "true" && flag != "false" {
		return nil, invalid("SMS_VERIFICATION_ENABLED", "短信验证开关必须为 true 或 false")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, g := range definitions {
		m.applied[g.ID] = records[g.ID].Version
	}
	return values, nil
}
