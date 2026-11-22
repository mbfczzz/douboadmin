package settings

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"fmt"
	"strings"
)

type Update struct {
	Version int64    `json:"version"`
	Values  Values   `json:"values"`
	Clear   []string `json:"clear"`
}

func (m *Manager) Save(ctx context.Context, id, actor string, input Update, production bool) error {
	g, ok := group(id)
	if !ok {
		return core.ErrNotFound
	}
	allowed := map[string]Field{}
	for _, field := range g.Fields {
		allowed[field.Key] = field
	}
	for key := range input.Values {
		if _, ok := allowed[key]; !ok {
			return invalid("", "配置包含不支持的字段")
		}
	}
	clear := map[string]bool{}
	for _, key := range input.Clear {
		if field, ok := allowed[key]; !ok || field.Kind != "secret" || strings.TrimSpace(input.Values[key]) != "" {
			return invalid("", "清除密钥的参数无效")
		}
		clear[key] = true
	}
	return m.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, err := tx.Lock("settings_control", core.Record{ID: "integrations", Data: core.Data(map[string]string{})}); err != nil {
			return err
		}
		values, records, err := m.resolve(tx)
		if err != nil {
			return err
		}
		row := records[id]
		if input.Version < 0 || row.Version != input.Version {
			return fmt.Errorf("%w: 配置已被其他管理员更新，请重新读取后再保存", core.ErrConflict)
		}
		previous := Values{}
		for key, value := range values {
			previous[key] = value
		}
		changed := []string{}
		stored := Values{}
		for _, field := range g.Fields {
			key := field.Key
			value := values[key]
			if next, ok := input.Values[key]; ok && (field.Kind != "secret" || strings.TrimSpace(next) != "") {
				value = strings.TrimSpace(next)
			}
			if clear[key] {
				value = ""
			}
			if field.Kind == "origins" {
				parts := []string{}
				for _, part := range strings.Split(value, ",") {
					if part = strings.TrimSpace(part); part != "" {
						parts = append(parts, strings.TrimRight(part, "/"))
					}
				}
				value = strings.Join(parts, ",")
			}
			if value != previous[key] {
				changed = append(changed, key)
			}
			stored[key], values[key] = value, value
		}
		if err = validate(g, values, production); err != nil {
			return err
		}
		if err = protectIdentity(tx, id, previous, values, input); err != nil {
			return err
		}
		key, err := m.encryptionKey(len(records) > 0)
		if err != nil {
			return err
		}
		raw, err := seal(id, stored, key)
		if err != nil {
			return fmt.Errorf("无法加密接入配置")
		}
		if _, err = tx.Put(namespace, core.Record{ID: id, Data: raw}, input.Version); err != nil {
			return err
		}
		_, err = tx.Put("integration_audit", core.Record{ID: core.NewID(), Owner: actor, Data: core.Data(map[string]any{
			"group": id, "actor": actor, "fields": changed, "version": input.Version + 1,
		})}, 0)
		return err
	})
}
