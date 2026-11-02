package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"fmt"
)

func (m *MySQL) PaymentRecords(ctx context.Context, q core.PaymentQuery) (core.PaymentPage, error) {
	out := core.PaymentPage{Items: []core.PaymentRecord{}, Page: q.Page, Size: q.Size}
	if !validPaymentQuery(q) {
		return out, fmt.Errorf("invalid payment query")
	}
	where := ` FROM records t JOIN records o ON o.namespace='orders' AND o.id=JSON_UNQUOTE(t.data) WHERE t.namespace='payment_transactions' AND JSON_UNQUOTE(JSON_EXTRACT(o.data,'$.transactionId'))=t.id AND JSON_UNQUOTE(JSON_EXTRACT(o.data,'$.status')) IN ('paid','refunding','refunded')`
	args := []any{}
	if q.Search != "" {
		where += ` AND (LOCATE(?,t.id)>0 OR LOCATE(?,o.id)>0 OR LOCATE(?,o.owner_id)>0)`
		args = append(args, q.Search, q.Search, q.Search)
	}
	if q.Status != "" {
		where += ` AND JSON_UNQUOTE(JSON_EXTRACT(o.data,'$.status'))=?`
		args = append(args, q.Status)
	}
	if !q.From.IsZero() {
		where += ` AND t.created_at>=?`
		args = append(args, q.From.UTC())
	}
	if !q.Until.IsZero() {
		where += ` AND t.created_at<?`
		args = append(args, q.Until.UTC())
	}
	// Count and rows use the same snapshot while receipts or refunds are arriving.
	tx, e := m.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if e != nil {
		return out, e
	}
	defer tx.Rollback()
	if e = tx.QueryRowContext(ctx, `SELECT COUNT(*)`+where, args...).Scan(&out.Total); e != nil {
		return out, e
	}
	rows, e := tx.QueryContext(ctx, `SELECT t.id,t.created_at,o.id,o.owner_id,o.data`+where+` ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`, append(args, q.Size, (q.Page-1)*q.Size)...)
	if e != nil {
		return out, e
	}
	for rows.Next() {
		var receipt, order core.Record
		if e = rows.Scan(&receipt.ID, &receipt.CreatedAt, &order.ID, &order.Owner, &order.Data); e != nil {
			rows.Close()
			return out, e
		}
		v, err := paymentView(receipt, order)
		if err != nil {
			rows.Close()
			return out, err
		}
		out.Items = append(out.Items, v)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return out, e
	}
	return out, tx.Commit()
}
