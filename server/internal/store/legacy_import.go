package store

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"
)

// legacyNames maps namespaces renamed by the table split.
var legacyNames = map[string]string{"settings": "distribution_policy"}

// importLegacyRecords copies rows from the old generic `records` table into
// the per-namespace tables, keeping id, owner, version and created_at.
// Existing rows are never overwritten, so it is safe to run again; fields
// that no longer exist are dropped, and rows of retired namespaces or with
// values of the wrong type are skipped and counted. The old table is left
// for deploy/sql/drop-legacy-records.sql.
func (m *MySQL) importLegacyRecords(ctx context.Context) error {
	var exists int
	if err := m.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='records'`).Scan(&exists); err != nil || exists == 0 {
		return err
	}
	rows, err := m.db.QueryContext(ctx, `SELECT namespace,id,owner_id,version,data,created_at FROM records ORDER BY namespace,id`)
	if err != nil {
		return err
	}
	defer rows.Close()
	copied, skipped, dropped := 0, map[string]int{}, map[string]int{}
	for rows.Next() {
		var ns, id, owner string
		var version int64
		var data []byte
		var created time.Time
		if err = rows.Scan(&ns, &id, &owner, &version, &data, &created); err != nil {
			return err
		}
		if renamed, ok := legacyNames[ns]; ok {
			ns = renamed
		}
		t, err := tableOf(ns)
		if err != nil {
			skipped[ns]++
			continue
		}
		values, err := t.encode(t.known(data, dropped))
		if err != nil {
			skipped[ns]++
			continue
		}
		cols := append([]string{"id", "owner_id", "version", "created_at"}, t.columns()...)
		marks := strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",")
		q := "INSERT IGNORE INTO `" + t.Name + "` (" + strings.Join(cols, ",") + ") VALUES (" + marks + ")"
		if _, err = m.db.ExecContext(ctx, q, append([]any{id, owner, version, created}, values...)...); err != nil {
			return err
		}
		copied++
	}
	slog.Info("legacy records imported", "rows", copied, "skipped", skipped, "droppedFields", dropped)
	return rows.Err()
}

// known removes fields the table has no column for, counting them.
func (t Table) known(data []byte, dropped map[string]int) []byte {
	var fields map[string]json.RawMessage
	if t.scalar() || json.Unmarshal(data, &fields) != nil {
		return data
	}
	for key := range fields {
		if !t.has(key) {
			delete(fields, key)
			dropped[t.Name+"."+key]++
		}
	}
	out, _ := json.Marshal(fields)
	return out
}
