package store

import (
	"context"
	"fmt"
)

// Called with service writers stopped. Never silently choose between duplicates.
func (m *MySQL) migrateAdminPhone(ctx context.Context) error {
	var count int
	effective := `SELECT a.id, TRIM(CASE WHEN COALESCE(a.user_id,'')<>'' THEN u.phone ELSE a.phone END) AS phone FROM admin_accounts a LEFT JOIN users u ON u.id=a.user_id WHERE COALESCE(a.archived,0)=0`
	q := `SELECT COUNT(*) FROM (SELECT phone FROM (` + effective + `) e WHERE COALESCE(phone,'')<>'' GROUP BY phone HAVING COUNT(*)>1) duplicates`
	if err := m.db.QueryRowContext(ctx, q).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("admin phone migration: %d duplicate phone groups; resolve before retrying", count)
	}
	// Keep the persisted field consistent with the linked user before indexing it.
	if _, err := m.db.ExecContext(ctx, `UPDATE admin_accounts a JOIN users u ON u.id=a.user_id SET a.phone=u.phone,a.version=a.version+1 WHERE NOT (a.phone <=> u.phone)`); err != nil {
		return err
	}
	if err := m.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_accounts' AND COLUMN_NAME='active_phone'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if _, err := m.db.ExecContext(ctx, `ALTER TABLE admin_accounts ADD COLUMN active_phone VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN COALESCE(archived,0)=0 THEN NULLIF(TRIM(phone),'') ELSE NULL END) STORED`); err != nil {
			return err
		}
	}
	if err := m.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_accounts' AND INDEX_NAME='unique_admin_phone'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if _, err := m.db.ExecContext(ctx, `ALTER TABLE admin_accounts ADD UNIQUE INDEX unique_admin_phone(active_phone)`); err != nil {
			return err
		}
	}
	return nil
}
