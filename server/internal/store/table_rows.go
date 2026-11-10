package store

import (
	"context"
	"database/sql"
	"strings"

	"doubo/server/internal/core"
)

// querier is what both *sql.DB and *sql.Tx offer.
type querier interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (t Table) columns() []string {
	out := make([]string, len(t.Cols))
	for i, c := range t.Cols {
		out[i] = "`" + c.column() + "`"
	}
	return out
}

// selectList is the column list every read uses, bookkeeping first.
func (t Table) selectList() string {
	return strings.Join(append([]string{"id", "owner_id", "version", "created_at"}, t.columns()...), ",")
}

// selectAs is selectList qualified by a table alias, for joins.
func (t Table) selectAs(alias string) string {
	return alias + "." + strings.ReplaceAll(t.selectList(), ",", ","+alias+".")
}

// scanRecord reads one row into a record, rebuilding its JSON data.
func (t Table) scanRecord(row interface{ Scan(...any) error }) (core.Record, error) {
	var r core.Record
	cells := make([]any, len(t.Cols))
	dest := []any{&r.ID, &r.Owner, &r.Version, &r.CreatedAt}
	for i, c := range t.Cols {
		switch c.Kind {
		case Int:
			cells[i] = new(sql.NullInt64)
		case Float:
			cells[i] = new(sql.NullFloat64)
		case Bool:
			cells[i] = new(sql.NullBool)
		case Time:
			cells[i] = new(sql.NullTime)
		default:
			cells[i] = new(sql.NullString)
		}
		dest = append(dest, cells[i])
	}
	if err := row.Scan(dest...); err != nil {
		return r, err
	}
	data, err := t.build(cells)
	r.Data = data
	return r, err
}

func getRow(ctx context.Context, q querier, ns, id, suffix string) (core.Record, error) {
	t, err := tableOf(ns)
	if err != nil {
		return core.Record{}, err
	}
	r, err := t.scanRecord(q.QueryRowContext(ctx, "SELECT "+t.selectList()+" FROM `"+t.Name+"` WHERE id=?"+suffix, id))
	if err == sql.ErrNoRows {
		err = core.ErrNotFound
	}
	return r, err
}

// insertRow adds a record at version 1; with ignore it leaves an existing
// row untouched (used by Lock's initializer).
func insertRow(ctx context.Context, q querier, ns string, r core.Record, ignore bool) (sql.Result, error) {
	t, err := tableOf(ns)
	if err != nil {
		return nil, err
	}
	values, err := t.encode(r.Data)
	if err != nil {
		return nil, err
	}
	cols := append([]string{"id", "owner_id", "version"}, t.columns()...)
	marks := strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",")
	query := "INSERT INTO `" + t.Name + "` (" + strings.Join(cols, ",") + ") VALUES (" + marks + ")"
	if ignore {
		query += " ON DUPLICATE KEY UPDATE id=id"
	}
	return q.ExecContext(ctx, query, append([]any{r.ID, r.Owner, 1}, values...)...)
}

// updateRow replaces a record's data if it is still at version.
func updateRow(ctx context.Context, q querier, ns string, r core.Record, version int64) (sql.Result, error) {
	t, err := tableOf(ns)
	if err != nil {
		return nil, err
	}
	values, err := t.encode(r.Data)
	if err != nil {
		return nil, err
	}
	sets := make([]string, len(t.Cols))
	for i, c := range t.columns() {
		sets[i] = c + "=?"
	}
	query := "UPDATE `" + t.Name + "` SET " + strings.Join(append(sets, "version=version+1"), ",") + " WHERE id=? AND version=?"
	return q.ExecContext(ctx, query, append(values, r.ID, version)...)
}

func listRows(ctx context.Context, q querier, query string, t Table, args ...any) ([]core.Record, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Record{}
	for rows.Next() {
		r, err := t.scanRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
