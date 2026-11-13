package store

import (
	"context"
	"fmt"
)

const userPhoneOwnersBackfill = "INSERT INTO phone_owners (id,owner_id,version,`user`) SELECT phone,'',1,id FROM users WHERE COALESCE(archived,0)=0 AND COALESCE(phone,'')<>'' ON DUPLICATE KEY UPDATE `user`=VALUES(`user`), version=phone_owners.version+1"

// Run only through the explicit migrate command, with writers stopped.
// Conflicting historical identities abort migration instead of choosing a winner.
func (m *MySQL) migrateUserIdentity(ctx context.Context) error {
	checks := []string{
		`SELECT COUNT(*) FROM (SELECT phone FROM users WHERE COALESCE(archived,0)=0 AND COALESCE(phone,'')<>'' GROUP BY phone HAVING COUNT(*)>1) d`,
		`SELECT COUNT(*) FROM users WHERE COALESCE(archived,0)=0 AND COALESCE(phone,'')<>'' AND phone NOT REGEXP '^1[0-9]{10}$'`,
		"SELECT COUNT(*) FROM users u JOIN phone_owners p ON p.id=u.phone WHERE COALESCE(u.archived,0)=0 AND COALESCE(p.`user`,'')<>'' AND p.`user`<>u.id",
	}
	for i, q := range checks {
		var count int
		if err := m.db.QueryRowContext(ctx, q).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("identity migration preflight %d: %d conflicts; review identities before retrying", i+1, count)
		}
	}
	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	queries := []string{
		`UPDATE users SET source=IF(auth_provider='wechat' OR id LIKE 'wx-%','miniprogram','other'), version=version+1 WHERE COALESCE(source,'')=''`,
		`UPDATE users SET sources=JSON_ARRAY(source), version=version+1 WHERE sources IS NULL`,
		userPhoneOwnersBackfill,
	}
	for i, q := range queries {
		if _, err = tx.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("user identity backfill step %d: %w", i+1, err)
		}
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	var count int
	if err = m.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='active_phone'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if _, err = m.db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN active_phone VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN COALESCE(archived,0)=0 THEN NULLIF(phone,'') ELSE NULL END) STORED`); err != nil {
			return err
		}
	}
	if err = m.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='unique_active_phone'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		_, err = m.db.ExecContext(ctx, `ALTER TABLE users ADD UNIQUE INDEX unique_active_phone(active_phone)`)
	}
	return err
}
