package store

import (
	"fmt"
	"sort"
	"strings"
)

// Each record namespace lives in its own MySQL table. Every table has the
// same bookkeeping columns (id, owner_id, version, created_at, updated_at)
// followed by one real column per JSON field of the record's data.
//
// Column kinds decide the SQL type and how a JSON value is stored:
//   - Text / Short / Key / Long: strings (TEXT, VARCHAR(255), VARCHAR(64),
//     LONGTEXT for payloads that may exceed 64 KB);
//   - Int, Float, Bool: numbers and flags;
//   - Time: RFC 3339 timestamps, stored as DATETIME(6) in UTC;
//   - JSON: nested objects or arrays, kept as JSON.
//
// A field absent from the data is stored as NULL and left out again when
// the record is read, so omitted and zero values round-trip unchanged.
type kind int

const (
	Text kind = iota
	Short
	Key
	Long
	Int
	Float
	Bool
	Time
	JSON
)

var sqlTypes = map[kind]string{
	Text:  "TEXT",
	Short: "VARCHAR(255)",
	Key:   "VARCHAR(64)",
	Long:  "LONGTEXT",
	Int:   "BIGINT",
	Float: "DOUBLE",
	Bool:  "BOOLEAN",
	Time:  "DATETIME(6)",
	JSON:  "JSON",
}

// Col maps one JSON field of a record to a column. A table whose data is a
// single value (not an object) has one Col with an empty Field and a Name.
type Col struct {
	Field string // JSON key in the record data
	Kind  kind
	Name  string // column name when it differs from the field's
}

func (c Col) column() string {
	if c.Name != "" {
		return c.Name
	}
	return column(c.Field)
}

// scalar reports a table whose whole data is one value.
func (t Table) scalar() bool { return len(t.Cols) == 1 && t.Cols[0].Field == "" }

// Table describes one namespace: its table name, what the row is, what
// owner_id means for it, its data columns and extra indexes.
type Table struct {
	Name    string
	Comment string // shown by SHOW TABLE STATUS / information_schema
	Owner   string // what owner_id holds, "" when unused
	Cols    []Col
	Indexes []string // column lists, e.g. "partner_id,status"
}

// column is the SQL name of a JSON field: partnerId → partner_id.
func column(field string) string {
	var b strings.Builder
	for i, r := range field {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				b.WriteByte('_')
			}
			r += 'a' - 'A'
		}
		b.WriteRune(r)
	}
	return b.String()
}

// DDL is the CREATE TABLE statement of a table.
func (t Table) DDL() string {
	lines := []string{
		"id VARCHAR(64) NOT NULL",
		"owner_id VARCHAR(64) NOT NULL DEFAULT ''",
		"version BIGINT NOT NULL",
	}
	for _, c := range t.Cols {
		lines = append(lines, fmt.Sprintf("`%s` %s NULL", c.column(), sqlTypes[c.Kind]))
	}
	lines = append(lines,
		"created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
		"updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)",
		"PRIMARY KEY (id)",
	)
	if t.Owner != "" {
		lines = append(lines, "KEY owner_list (owner_id, created_at)")
	} else {
		lines = append(lines, "KEY created (created_at)")
	}
	for _, ix := range t.Indexes {
		lines = append(lines, fmt.Sprintf("KEY `by_%s` (%s, created_at)", strings.ReplaceAll(ix, ",", "_"), ix))
	}
	comment := t.Comment
	if t.Owner != "" {
		comment += "；owner_id = " + t.Owner
	}
	return fmt.Sprintf("CREATE TABLE IF NOT EXISTS `%s` (\n  %s\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='%s'",
		t.Name, strings.Join(lines, ",\n  "), strings.ReplaceAll(comment, "'", "''"))
}

// tables maps each namespace to its table; see tables_*.go.
var tables = map[string]Table{}

func register(ts ...Table) {
	for _, t := range ts {
		if _, dup := tables[t.Name]; dup {
			panic("store: table registered twice: " + t.Name)
		}
		tables[t.Name] = t
	}
}

// tableOf returns the table of a namespace; an unknown namespace is a
// programming error, refused rather than silently stored somewhere.
func tableOf(ns string) (Table, error) {
	t, ok := tables[ns]
	if !ok {
		return t, fmt.Errorf("store: no table for namespace %q", ns)
	}
	return t, nil
}

// Tables lists every registered table, sorted by name (for migrations and
// schema checks).
func Tables() []Table {
	out := make([]Table, 0, len(tables))
	for _, t := range tables {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}
