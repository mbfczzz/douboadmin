package store

import (
	"context"
	"fmt"
)

// addMissingColumns adds columns declared after a table was created, so a
// new record field only needs a Col and a migrate run. Columns are never
// dropped or retyped here; that stays a reviewed manual change.
func (m *MySQL) addMissingColumns(ctx context.Context) error {
	rows, err := m.db.QueryContext(ctx, `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()`)
	if err != nil {
		return err
	}
	have := map[string]bool{}
	for rows.Next() {
		var table, col string
		if err = rows.Scan(&table, &col); err != nil {
			rows.Close()
			return err
		}
		have[table+"."+col] = true
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, t := range Tables() {
		after := "version" // keep declared order: data columns sit before created_at
		for _, c := range t.Cols {
			prev := after
			after = c.column()
			if have[t.Name+"."+c.column()] {
				continue
			}
			q := fmt.Sprintf("ALTER TABLE `%s` ADD COLUMN `%s` %s NULL AFTER `%s`", t.Name, c.column(), sqlTypes[c.Kind], prev)
			if _, err = m.db.ExecContext(ctx, q); err != nil {
				return err
			}
		}
	}
	return nil
}
