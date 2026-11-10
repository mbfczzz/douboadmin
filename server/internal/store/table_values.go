package store

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// encode turns record data into one SQL value per column. A key the table
// does not know is an error: every field must have a column.
func (t Table) encode(data []byte) ([]any, error) {
	if t.scalar() {
		v, err := encodeValue(t.Cols[0].Kind, data)
		return []any{v}, err
	}
	fields := map[string]json.RawMessage{}
	if len(bytes.TrimSpace(data)) > 0 {
		dec := json.NewDecoder(bytes.NewReader(data))
		dec.UseNumber()
		if err := dec.Decode(&fields); err != nil {
			return nil, fmt.Errorf("store: %s data is not an object: %w", t.Name, err)
		}
	}
	values := make([]any, len(t.Cols))
	for i, c := range t.Cols {
		raw, ok := fields[c.Field]
		delete(fields, c.Field)
		if !ok || string(raw) == "null" {
			continue // NULL: absent field
		}
		v, err := encodeValue(c.Kind, raw)
		if err != nil {
			return nil, fmt.Errorf("store: %s.%s: %w", t.Name, c.Field, err)
		}
		values[i] = v
	}
	for field := range fields {
		return nil, fmt.Errorf("store: %s has no column for field %q", t.Name, field)
	}
	return values, nil
}

func encodeValue(k kind, raw json.RawMessage) (any, error) {
	switch k {
	case Text, Short, Key, Long:
		var s string
		err := json.Unmarshal(raw, &s)
		return s, err
	case Int:
		var n json.Number
		if err := json.Unmarshal(raw, &n); err != nil {
			return nil, err
		}
		return n.Int64()
	case Float:
		var f float64
		err := json.Unmarshal(raw, &f)
		return f, err
	case Bool:
		var b bool
		err := json.Unmarshal(raw, &b)
		return b, err
	case Time:
		var at time.Time
		if err := json.Unmarshal(raw, &at); err != nil {
			return nil, err
		}
		if at.IsZero() {
			return nil, nil // zero time reads back as an absent field
		}
		return at.UTC().Truncate(time.Microsecond), nil // DATETIME(6)
	default:
		return string(raw), nil
	}
}

// cellValue is the JSON value of one scanned cell (nil for NULL).
func cellValue(c Col, cell any) any {
	switch v := cell.(type) {
	case *sql.NullInt64:
		if v.Valid {
			return v.Int64
		}
	case *sql.NullFloat64:
		if v.Valid {
			return v.Float64
		}
	case *sql.NullBool:
		if v.Valid {
			return v.Bool
		}
	case *sql.NullTime:
		if v.Valid {
			return v.Time.UTC().Format(time.RFC3339Nano)
		}
	case *sql.NullString:
		if v.Valid && c.Kind == JSON {
			return json.RawMessage(v.String)
		}
		if v.Valid {
			return v.String
		}
	}
	return nil
}

// normalize returns data as it reads back after a write (absent zero
// times, UTC microsecond timestamps), refusing data the table cannot hold.
// The memory store uses it so tests see what MySQL would return.
func (t Table) normalize(data []byte) ([]byte, error) {
	values, err := t.encode(data)
	if err != nil {
		return nil, err
	}
	cells := make([]any, len(values))
	for i, v := range values {
		cells[i] = cellOf(v)
	}
	return t.build(cells)
}

// build rebuilds record JSON from one cell per column.
func (t Table) build(cells []any) ([]byte, error) {
	if t.scalar() {
		return json.Marshal(cellValue(t.Cols[0], cells[0]))
	}
	fields := make(map[string]any, len(t.Cols))
	for i, c := range t.Cols {
		if v := cellValue(c, cells[i]); v != nil {
			fields[c.Field] = v
		}
	}
	return json.Marshal(fields)
}

// cellOf wraps an encoded value the way a scan would return it.
func cellOf(v any) any {
	switch x := v.(type) {
	case int64:
		return &sql.NullInt64{Int64: x, Valid: true}
	case float64:
		return &sql.NullFloat64{Float64: x, Valid: true}
	case bool:
		return &sql.NullBool{Bool: x, Valid: true}
	case time.Time:
		return &sql.NullTime{Time: x, Valid: true}
	case string:
		return &sql.NullString{String: x, Valid: true}
	}
	return &sql.NullString{}
}
