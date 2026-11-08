package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"

	"github.com/go-sql-driver/mysql"
)

type mysqlTransaction struct {
	ctx context.Context
	tx  *sql.Tx
}

func (t *mysqlTransaction) HasRecords(ns string) (bool, error) {
	var found bool
	err := t.tx.QueryRowContext(t.ctx, `SELECT EXISTS(SELECT 1 FROM records WHERE namespace=? LIMIT 1)`, ns).Scan(&found)
	return found, err
}

func (m *MySQL) Atomic(ctx context.Context, fn func(Transaction) error) error {
	tx, err := m.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fn(&mysqlTransaction{ctx, tx}); err != nil {
		return err
	}
	return tx.Commit()
}
func (t *mysqlTransaction) record(ns, id, lock string) (r core.Record, err error) {
	err = t.tx.QueryRowContext(t.ctx, `SELECT id,owner_id,version,data,created_at FROM records WHERE namespace=? AND id=?`+lock, ns, id).Scan(&r.ID, &r.Owner, &r.Version, &r.Data, &r.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		err = core.ErrNotFound
	}
	return
}
func (t *mysqlTransaction) Get(ns, id string) (core.Record, error) { return t.record(ns, id, "") }
func (t *mysqlTransaction) Lock(ns string, initial core.Record) (core.Record, error) {
	_, err := t.tx.ExecContext(t.ctx, `INSERT INTO records(namespace,id,owner_id,version,data) VALUES(?,?,?,1,?) ON DUPLICATE KEY UPDATE id=id`, ns, initial.ID, initial.Owner, string(initial.Data))
	if err != nil {
		return initial, err
	}
	return t.record(ns, initial.ID, " FOR UPDATE")
}
func (t *mysqlTransaction) Put(ns string, r core.Record, version int64) (core.Record, error) {
	var result sql.Result
	var err error
	if version == 0 {
		result, err = t.tx.ExecContext(t.ctx, `INSERT INTO records(namespace,id,owner_id,version,data) VALUES(?,?,?,1,?)`, ns, r.ID, r.Owner, string(r.Data))
	} else {
		result, err = t.tx.ExecContext(t.ctx, `UPDATE records SET data=?,version=version+1 WHERE namespace=? AND id=? AND version=?`, string(r.Data), ns, r.ID, version)
	}
	var me *mysql.MySQLError
	if errors.As(err, &me) && me.Number == 1062 {
		return r, core.ErrConflict
	}
	if err != nil {
		return r, err
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		return r, core.ErrConflict
	}
	return t.Get(ns, r.ID)
}
func (t *mysqlTransaction) Job(id string) (core.Job, error) {
	return scanJob(t.tx.QueryRowContext(t.ctx, `SELECT `+jobCols+` FROM jobs WHERE id=?`, id))
}
func (t *mysqlTransaction) InsertJob(j core.Job) error {
	b, _ := json.Marshal(j.Input)
	_, err := t.tx.ExecContext(t.ctx, `INSERT INTO jobs(id,user_id,input,request_hash,status,result,error) VALUES(?,?,?,?,'queued','','')`, j.ID, j.UserID, string(b), j.Hash)
	return err
}
func affected(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		return core.ErrConflict
	}
	return nil
}
func (t *mysqlTransaction) CompleteJob(j core.Job, result, failure string) error {
	state := "succeeded"
	if failure != "" {
		state = "failed"
	}
	return affected(t.tx.ExecContext(t.ctx, `UPDATE jobs SET status=?,progress=100,result=?,error=?,updated_at=UTC_TIMESTAMP(6),lease_until=NULL WHERE id=? AND status='running' AND lease_token=? AND lease_until>UTC_TIMESTAMP(6)`, state, result, failure, j.ID, j.LeaseToken))
}
func (t *mysqlTransaction) ResumeJob(id string) error {
	return affected(t.tx.ExecContext(t.ctx, `UPDATE jobs SET status='queued',progress=0,error='',lease_token='',lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='failed'`, id))
}
