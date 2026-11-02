package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

func validPaymentQuery(q core.PaymentQuery) bool {
	return q.Page >= 1 && q.Page <= 1000000 && q.Size >= 1 && q.Size <= 100 && len([]rune(q.Search)) <= 100 &&
		(q.Status == "" || q.Status == "paid" || q.Status == "refunding" || q.Status == "refunded") &&
		(q.From.IsZero() || q.Until.IsZero() || q.From.Before(q.Until))
}

func paymentView(receipt, order core.Record) (core.PaymentRecord, error) {
	var value core.Order
	if e := json.Unmarshal(order.Data, &value); e != nil {
		return core.PaymentRecord{}, e
	}
	if value.PaidAt == nil || value.TransactionID != receipt.ID {
		return core.PaymentRecord{}, fmt.Errorf("inconsistent payment receipt")
	}
	return core.PaymentRecord{TransactionID: receipt.ID, OrderID: order.ID, UserID: order.Owner,
		Channel: value.Channel, AmountFen: value.AmountFen, PointsUnits: value.PointsUnits,
		Status: value.Status, PaidAt: *value.PaidAt, ConfirmedAt: receipt.CreatedAt, RefundID: value.RefundID}, nil
}

func (m *Memory) PaymentRecords(_ context.Context, q core.PaymentQuery) (core.PaymentPage, error) {
	out := core.PaymentPage{Items: []core.PaymentRecord{}, Page: q.Page, Size: q.Size}
	if !validPaymentQuery(q) {
		return out, fmt.Errorf("invalid payment query")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	all := []core.PaymentRecord{}
	for key, receipt := range m.records {
		if key != "payment_transactions:"+receipt.ID {
			continue
		}
		var orderID string
		if json.Unmarshal(receipt.Data, &orderID) != nil {
			continue
		}
		order, exists := m.records["orders:"+orderID]
		if !exists {
			continue
		}
		v, err := paymentView(receipt, order)
		if err != nil {
			return out, err
		}
		if v.Status != "paid" && v.Status != "refunding" && v.Status != "refunded" {
			continue
		}
		if q.Status != "" && v.Status != q.Status {
			continue
		}
		if !q.From.IsZero() && v.ConfirmedAt.Before(q.From) || !q.Until.IsZero() && !v.ConfirmedAt.Before(q.Until) {
			continue
		}
		if q.Search != "" && !strings.Contains(strings.ToLower(v.TransactionID+"\n"+v.OrderID+"\n"+v.UserID), strings.ToLower(q.Search)) {
			continue
		}
		all = append(all, v)
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].ConfirmedAt.Equal(all[j].ConfirmedAt) {
			return all[i].TransactionID > all[j].TransactionID
		}
		return all[i].ConfirmedAt.After(all[j].ConfirmedAt)
	})
	out.Total = len(all)
	start := (q.Page - 1) * q.Size
	if start < len(all) {
		out.Items = all[start:min(start+q.Size, len(all))]
	}
	return out, nil
}
