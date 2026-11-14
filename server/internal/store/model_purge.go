package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"time"
)

func modelPurgeCheck(row core.Record, version int64, created time.Time) error {
	if version < 1 || created.IsZero() || row.Version != version || !row.CreatedAt.Equal(created) {
		return core.ErrConflict
	}
	var model core.Model
	if err := json.Unmarshal(row.Data, &model); err != nil {
		return err
	}
	if !model.Deleted {
		return fmt.Errorf("%w：请先删除模型再彻底删除", core.ErrConflict)
	}
	return nil
}

func activeModelError() error {
	return fmt.Errorf("%w：模型仍有排队或运行中的任务，请等待任务结束", core.ErrConflict)
}

// Only the model row is removed. Jobs, financial records and templates survive.
// CreatedAt prevents a stale dialog deleting a freshly re-imported generation.
func (m *Memory) PurgeModel(_ context.Context, id string, version int64, created time.Time) (core.Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := "models:" + id
	row, ok := m.records[key]
	if !ok {
		return core.Record{}, core.ErrNotFound
	}
	if err := modelPurgeCheck(row, version, created); err != nil {
		return core.Record{}, err
	}
	for _, job := range m.jobs {
		if job.Input.Model == id && (job.Status == "queued" || job.Status == "running") {
			return core.Record{}, activeModelError()
		}
	}
	delete(m.records, key)
	return copyRecord(row), nil
}

func (m *MySQL) PurgeModel(ctx context.Context, id string, version int64, created time.Time) (core.Record, error) {
	tx, err := m.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return core.Record{}, err
	}
	defer tx.Rollback()
	row, err := getRow(ctx, tx, "models", id, " FOR UPDATE")
	if err != nil {
		return core.Record{}, err
	}
	if err = modelPurgeCheck(row, version, created); err != nil {
		return core.Record{}, err
	}
	var active bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE status IN ('queued','running') AND input->>'$.model'=? LIMIT 1)`, id).Scan(&active)
	if err != nil {
		return core.Record{}, err
	}
	if active {
		return core.Record{}, activeModelError()
	}
	if err = affected(tx.ExecContext(ctx, `DELETE FROM models WHERE id=? AND version=? AND created_at=? AND deleted=1`, id, version, created)); err != nil {
		return core.Record{}, err
	}
	return row, tx.Commit()
}
