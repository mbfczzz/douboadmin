package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"github.com/go-sql-driver/mysql"
	"time"
)

type MySQL struct{ db *sql.DB }

func NewMySQL(dsn string) (*MySQL, error) {
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return nil, err
	}
	cfg.ParseTime = true
	cfg.Loc = time.UTC
	cfg.MultiStatements = false
	if cfg.Params == nil {
		cfg.Params = map[string]string{}
	}
	cfg.Params["time_zone"] = "'+00:00'"
	db, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	return &MySQL{db}, nil
}

// Migrate is an explicit deployment command. Never run schema changes on API startup.
func (m *MySQL) Migrate(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS jobs (id CHAR(32) PRIMARY KEY,user_id VARCHAR(64) NOT NULL,input JSON NOT NULL,request_hash CHAR(64) NOT NULL,status VARCHAR(16) NOT NULL,progress INT NOT NULL DEFAULT 0,result MEDIUMTEXT NOT NULL,error TEXT NOT NULL,attempts INT NOT NULL DEFAULT 0,lease_token VARCHAR(32) NOT NULL DEFAULT '',lease_until DATETIME(6) NULL,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),KEY queue_claim(status,lease_until,created_at),KEY user_jobs(user_id,created_at)) ENGINE=InnoDB COMMENT='生成任务'`,
		auditTable,
	}
	for _, t := range Tables() {
		statements = append(statements, t.DDL())
	}
	for _, q := range statements {
		if _, err := m.db.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	if err := m.addMissingColumns(ctx); err != nil {
		return err
	}
	return m.importLegacyRecords(ctx)
}
func (m *MySQL) Get(ctx context.Context, ns, id string) (core.Record, error) {
	return getRow(ctx, m.db, ns, id, "")
}

// List returns a namespace's newest 500 records, optionally one owner's.
func (m *MySQL) List(ctx context.Context, ns, owner string) ([]core.Record, error) {
	t, err := tableOf(ns)
	if err != nil {
		return nil, err
	}
	q := "SELECT " + t.selectList() + " FROM `" + t.Name + "`"
	args := []any{}
	if owner != "" {
		q += " WHERE owner_id=?"
		args = append(args, owner)
	}
	return listRows(ctx, m.db, q+" ORDER BY created_at DESC LIMIT 500", t, args...)
}
func (m *MySQL) Put(ctx context.Context, ns string, r core.Record, version int64) (core.Record, error) {
	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return r, err
	}
	defer tx.Rollback()
	if err = putRow(ctx, tx, ns, r, version); err != nil {
		return r, err
	}
	if r, err = getRow(ctx, tx, ns, r.ID, ""); err != nil {
		return r, err
	}
	return r, tx.Commit()
}

// putRow inserts at version 0, else updates if the stored version matches.
func putRow(ctx context.Context, q querier, ns string, r core.Record, version int64) error {
	var result sql.Result
	var err error
	if version == 0 {
		result, err = insertRow(ctx, q, ns, r, false)
	} else {
		result, err = updateRow(ctx, q, ns, r, version)
	}
	var me *mysql.MySQLError
	if errors.As(err, &me) && me.Number == 1062 {
		return core.ErrConflict
	}
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return core.ErrConflict
	}
	return nil
}

const jobCols = `id,user_id,input,request_hash,status,progress,result,error,attempts,lease_token,lease_until,created_at,updated_at`

type scanner interface{ Scan(...any) error }

func scanJob(row scanner) (j core.Job, err error) {
	var raw []byte
	var lease sql.NullTime
	err = row.Scan(&j.ID, &j.UserID, &raw, &j.Hash, &j.Status, &j.Progress, &j.Result, &j.Error, &j.Attempts, &j.LeaseToken, &lease, &j.CreatedAt, &j.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		err = core.ErrNotFound
	}
	if err != nil {
		return
	}
	err = json.Unmarshal(raw, &j.Input)
	j.LeaseUntil = lease.Time
	return
}
func (m *MySQL) Job(ctx context.Context, id string) (core.Job, error) {
	return scanJob(m.db.QueryRowContext(ctx, `SELECT `+jobCols+` FROM jobs WHERE id=?`, id))
}
func (m *MySQL) CreateJob(ctx context.Context, j core.Job) (core.Job, error) {
	return createFundedJob(ctx, m, j)
}

func (m *MySQL) Jobs(ctx context.Context, user string) ([]core.Job, error) {
	q := `SELECT ` + jobCols + ` FROM jobs`
	args := []any{}
	if user != "" {
		q += ` WHERE user_id=?`
		args = append(args, user)
	}
	q += ` ORDER BY created_at DESC LIMIT 200`
	rows, err := m.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Job{}
	for rows.Next() {
		j, e := scanJob(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, j)
	}
	return out, rows.Err()
}
func (m *MySQL) Claim(ctx context.Context) (core.Job, error) {
	tx, err := m.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return core.Job{}, err
	}
	defer tx.Rollback()
	j, err := scanJob(tx.QueryRowContext(ctx, `SELECT `+jobCols+` FROM jobs WHERE status='queued' OR (status='running' AND lease_until<=UTC_TIMESTAMP(6)) ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED`))
	if err != nil {
		return j, err
	}
	token := core.NewID()
	_, err = tx.ExecContext(ctx, `UPDATE jobs SET status='running',attempts=attempts+1,lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 60 SECOND),updated_at=UTC_TIMESTAMP(6) WHERE id=?`, token, j.ID)
	if err != nil {
		return j, err
	}
	if err = tx.Commit(); err != nil {
		return j, err
	}
	j.LeaseToken = token
	j.Attempts++
	j.Status = "running"
	return j, nil
}
func (m *MySQL) Finish(ctx context.Context, j core.Job, result, failure string) error {
	return finishFundedJob(ctx, m, j, result, failure)
}

func (m *MySQL) Ping(ctx context.Context) error { return m.db.PingContext(ctx) }
func (m *MySQL) Close() error                   { return m.db.Close() }
