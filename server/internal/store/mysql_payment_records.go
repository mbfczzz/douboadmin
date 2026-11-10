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
	orders, _ := tableOf("orders")
	where := ` FROM payment_transactions t JOIN orders o ON o.id=t.order_id AND o.transaction_id=t.id WHERE o.status IN ('paid','refunding','refunded')`
	args := []any{}
	if q.Search != "" {
		where += ` AND (LOCATE(?,t.id)>0 OR LOCATE(?,o.id)>0 OR LOCATE(?,o.owner_id)>0)`
		args = append(args, q.Search, q.Search, q.Search)
	}
	if q.Status != "" {
		where += ` AND o.status=?`
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
	cols := "t.id,t.created_at," + orders.selectAs("o")
	rows, e := tx.QueryContext(ctx, `SELECT `+cols+where+` ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`, append(args, q.Size, (q.Page-1)*q.Size)...)
	if e != nil {
		return out, e
	}
	for rows.Next() {
		var receipt core.Record
		order, e := orders.scanRecord(prefixed{rows, []any{&receipt.ID, &receipt.CreatedAt}})
		if e != nil {
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

// prefixed scans a row whose first columns are extra values, then hands the
// rest to a record scanner.
type prefixed struct {
	row  interface{ Scan(...any) error }
	head []any
}

func (p prefixed) Scan(dest ...any) error { return p.row.Scan(append(p.head, dest...)...) }
