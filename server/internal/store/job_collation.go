package store

import (
	"context"
	"fmt"
	"regexp"
)

var sqlCharsetName = regexp.MustCompile(`^[A-Za-z0-9_]+$`)

func jobIDExpression(charset, collation string) (string, error) {
	if !sqlCharsetName.MatchString(charset) || !sqlCharsetName.MatchString(collation) {
		return "", fmt.Errorf("invalid job reference character set or collation")
	}
	return "CONVERT(j.id USING " + charset + ") COLLATE " + collation, nil
}

// Old jobs tables may inherit a different database collation from the newer
// record tables. Convert only the outer job id to the referenced column's
// collation, leaving that column bare so MySQL can use its primary-key lookup.
func (m *MySQL) jobReferenceID(ctx context.Context, table string) (string, error) {
	if table != "work_meta" && table != "job_billing" {
		return "", fmt.Errorf("unsupported job reference table")
	}
	if value, ok := m.jobIDComparisons.Load(table); ok {
		return value.(string), nil
	}
	var charset, collation string
	err := m.db.QueryRowContext(ctx, `SELECT CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='id'`, table).Scan(&charset, &collation)
	if err != nil {
		return "", fmt.Errorf("read job reference collation for %s: %w", table, err)
	}
	expression, err := jobIDExpression(charset, collation)
	if err != nil {
		return "", err
	}
	m.jobIDComparisons.Store(table, expression)
	return expression, nil
}
