package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
)

type mysqlTransaction struct {
	ctx context.Context
	tx  *sql.Tx
}

func (t *mysqlTransaction) HasRecords(ns string) (bool, error) {
	table, err := tableOf(ns)
	if err != nil {
		return false, err
	}
	var found bool
	err = t.tx.QueryRowContext(t.ctx, "SELECT EXISTS(SELECT 1 FROM `"+table.Name+"` LIMIT 1)").Scan(&found)
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
func (t *mysqlTransaction) Get(ns, id string) (core.Record, error) {
	return getRow(t.ctx, t.tx, ns, id, "")
}
func (t *mysqlTransaction) Lock(ns string, initial core.Record) (core.Record, error) {
	if len(initial.Data) > 0 {
		if _, err := insertRow(t.ctx, t.tx, ns, initial, true); err != nil {
			return initial, err
		}
	}
	return getRow(t.ctx, t.tx, ns, initial.ID, " FOR UPDATE")
}
func (t *mysqlTransaction) Put(ns string, r core.Record, version int64) (core.Record, error) {
	if err := putRow(t.ctx, t.tx, ns, r, version); err != nil {
		return r, err
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
