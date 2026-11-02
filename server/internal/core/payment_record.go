package core

import "time"

// A payment record is a confirmed receipt; unpaid orders and manual credits are excluded.
type PaymentRecord struct {
	TransactionID string    `json:"transactionId"`
	OrderID       string    `json:"orderId"`
	UserID        string    `json:"userId"`
	Channel       string    `json:"channel"`
	AmountFen     int64     `json:"amountFen"`
	PointsUnits   int64     `json:"pointsUnits"`
	Status        string    `json:"status"`
	PaidAt        time.Time `json:"paidAt"`
	ConfirmedAt   time.Time `json:"confirmedAt"`
	RefundID      string    `json:"refundId,omitempty"`
}

type PaymentQuery struct {
	Search, Status string
	From, Until    time.Time
	Page, Size     int
}

type PaymentPage struct {
	Items []PaymentRecord `json:"items"`
	Total int             `json:"total"`
	Page  int             `json:"page"`
	Size  int             `json:"size"`
}
