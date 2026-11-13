package store

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
)

func actorIDExpression(charset, collation string) (string, error) {
	if !sqlCharsetName.MatchString(charset) || !sqlCharsetName.MatchString(collation) {
		return "", fmt.Errorf("invalid activity reference character set or collation")
	}
	return "CONVERT(audit_logs.actor_id USING " + charset + ") COLLATE " + collation, nil
}

// Convert the outer audit ID to each reference table's actual collation.
// Leave the indexed reference id bare to retain primary-key lookups.
func (m *MySQL) activityComparisons(ctx context.Context, q core.AuditQuery) (map[string]string, error) {
	out := map[string]string{}
	if q.PartnerID == "" {
		return out, nil
	}
	tables := []string{"memberships"}
	if !q.MembersOnly {
		tables = append(tables, "admin_accounts", "partner_owners")
	}
	for _, table := range tables {
		if cached, ok := m.activityIDComparisons.Load(table); ok {
			out[table] = cached.(string)
			continue
		}
		var charset, collation string
		e := m.db.QueryRowContext(ctx, `SELECT CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='id'`, table).Scan(&charset, &collation)
		if e != nil {
			return nil, fmt.Errorf("read activity reference collation for %s: %w", table, e)
		}
		expression, e := actorIDExpression(charset, collation)
		if e != nil {
			return nil, e
		}
		m.activityIDComparisons.Store(table, expression)
		out[table] = expression
	}
	return out, nil
}
