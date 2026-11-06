package virtualpay

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

type PaymentEvent struct {
	Event       string    `json:"event"`
	OrderID     string    `json:"orderId"`
	RefundID    string    `json:"refundId"`
	ProviderID  string    `json:"providerId"`
	AmountFen   int64     `json:"amountFen"`
	Status      string    `json:"status"`
	Details     string    `json:"details"`
	Fingerprint string    `json:"fingerprint,omitempty"`
	Message     *Event    `json:"message,omitempty"`
	LastError   string    `json:"lastError,omitempty"`
	Note        string    `json:"note,omitempty"`
	Actor       string    `json:"actor,omitempty"`
	HandledAt   time.Time `json:"handledAt,omitempty"`
}

func (s *Service) updateEvent(ctx context.Context, id string, update func(*PaymentEvent) error) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		row, e := tx.Lock("virtual_payment_events", core.Record{ID: id, Data: core.Data(PaymentEvent{})})
		if e != nil {
			return e
		}
		var record PaymentEvent
		if e = json.Unmarshal(row.Data, &record); e != nil {
			return e
		}
		if e = update(&record); e != nil {
			return e
		}
		row.Data = core.Data(record)
		_, e = tx.Put("virtual_payment_events", row, row.Version)
		return e
	})
}

func (s *Service) audit(ctx context.Context, event Event, status string) error {
	return s.updateEvent(ctx, eventID(event), func(record *PaymentEvent) error {
		if record.Status == "done" || record.Status == "reviewed" {
			return nil
		}
		orderID := event.RefundOrderID
		if orderID == "" {
			orderID = event.OrderID
		}
		record.Event, record.OrderID = event.Name, orderID
		record.RefundID, record.ProviderID = event.RefundID, event.RefundWXID
		record.AmountFen, record.Status = event.RefundFee, status
		record.Message = &event
		record.Fingerprint = event.Fingerprint
		if event.Payload != "" {
			record.Details = event.Payload
		}
		if status == "done" {
			record.LastError = ""
		}
		return nil
	})
}

func (s *Service) eventError(ctx context.Context, id string, failure error) error {
	return s.updateEvent(ctx, id, func(record *PaymentEvent) error {
		if record.Status != "done" && record.Status != "reviewed" {
			record.LastError = failure.Error()
		}
		return nil
	})
}

func (s *Service) recordRefundIssue(ctx context.Context, orderID, refundID string, failure error) error {
	event := Event{Name: "refund_submission", RefundOrderID: orderID, RefundID: refundID}
	if e := s.audit(ctx, event, "pending"); e != nil {
		return e
	}
	return s.eventError(ctx, eventID(event), failure)
}

func (s *Service) RetryEvent(ctx context.Context, id, actor string) error {
	row, e := s.Store.Get(ctx, "virtual_payment_events", id)
	if e != nil {
		return e
	}
	var record PaymentEvent
	if e = json.Unmarshal(row.Data, &record); e != nil {
		return e
	}
	if record.Status == "done" || record.Status == "reviewed" {
		return nil
	}
	if record.Event == "refund_submission" || record.Event == "refund_abnormal" {
		// Always query the original refund first; an earlier request may have succeeded.
		e = s.RefreshRefund(ctx, record.RefundID)
		if e != nil && record.Event == "refund_submission" {
			refundRow, err := s.Store.Get(ctx, "refunds", record.RefundID)
			if err != nil {
				return err
			}
			var refund core.Refund
			if err = json.Unmarshal(refundRow.Data, &refund); err != nil {
				return err
			}
			_, e = s.StartRefund(ctx, record.OrderID, refund.Reason, actor)
		}
		if e == nil {
			refundRow, err := s.Store.Get(ctx, "refunds", record.RefundID)
			if err != nil {
				return err
			}
			var refund core.Refund
			if err = json.Unmarshal(refundRow.Data, &refund); err != nil {
				return err
			}
			if refund.Status == "abnormal" {
				e = fmt.Errorf("微信退款异常，请人工核对")
			}
		}
	} else {
		event := record.Message
		if event == nil && record.Details != "" {
			event = &Event{}
			if strings.HasPrefix(strings.TrimSpace(record.Details), "<") {
				e = xml.Unmarshal([]byte(record.Details), event)
			} else {
				e = json.Unmarshal([]byte(record.Details), event)
			}
			if e != nil {
				return e
			}
		}
		if event == nil {
			return fmt.Errorf("缺少原始通知，请人工核对")
		}
		event.Fingerprint, event.Payload = record.Fingerprint, record.Details
		e = s.processEvent(ctx, *event)
	}
	if e != nil {
		if saveErr := s.eventError(ctx, id, e); saveErr != nil {
			return saveErr
		}
		return e
	}
	return s.updateEvent(ctx, id, func(v *PaymentEvent) error {
		if record.Event == "refund_submission" || record.Event == "refund_abnormal" {
			v.Status = "done"
		}
		v.LastError, v.Actor, v.HandledAt = "", actor, time.Now().UTC()
		return nil
	})
}

// Reviewing an exception is an audit action, never a balance or order mutation.
func (s *Service) ReviewEvent(ctx context.Context, id string, version int64, note, actor string) error {
	if strings.TrimSpace(note) == "" || len([]rune(note)) > 500 {
		return fmt.Errorf("请填写 1–500 字核对说明")
	}
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		row, e := tx.Get("virtual_payment_events", id)
		if e != nil {
			return e
		}
		if row.Version != version {
			return core.ErrConflict
		}
		var record PaymentEvent
		if e = json.Unmarshal(row.Data, &record); e != nil {
			return e
		}
		if record.Status == "done" {
			return core.ErrConflict
		}
		record.Status, record.Note, record.Actor = "reviewed", strings.TrimSpace(note), actor
		record.HandledAt = time.Now().UTC()
		row.Data = core.Data(record)
		_, e = tx.Put("virtual_payment_events", row, row.Version)
		return e
	})
}
