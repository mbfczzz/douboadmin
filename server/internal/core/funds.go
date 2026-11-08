package core

import (
	"errors"
	"fmt"
	"math"
	"time"
)

var ErrInsufficient = errors.New("可用积分不足")
var ErrPaymentMismatch = errors.New("支付信息与订单不匹配")

// All point balances use hundredths of a point; monetary amounts use integer fen.
const PointScale int64 = 100
const MaxBalance int64 = 1_000_000_000_000_000

type Wallet struct {
	UserID    string `json:"userId"`
	Available int64  `json:"availableUnits"`
	Held      int64  `json:"heldUnits"`
}
type LedgerEntry struct {
	UserID         string `json:"userId"`
	Reference      string `json:"reference"`
	Kind           string `json:"kind"`
	AvailableDelta int64  `json:"availableDelta"`
	HeldDelta      int64  `json:"heldDelta"`
	AvailableAfter int64  `json:"availableAfter"`
	HeldAfter      int64  `json:"heldAfter"`
	Actor          string `json:"actor,omitempty"`
	Note           string `json:"note"`
}
type JobBilling struct {
	Units               int64  `json:"units"`
	State               string `json:"state"`
	EstimatedCostMicros *int64 `json:"estimatedCostMicros,omitempty"`
}
type Order struct {
	Virtual       *VirtualOrder         `json:"virtual,omitempty"`
	Distribution  *DistributionSnapshot `json:"distribution,omitempty"`
	UserID        string                `json:"userId"`
	AmountFen     int64                 `json:"amountFen"`
	PointsUnits   int64                 `json:"pointsUnits"`
	Status        string                `json:"status"`
	Channel       string                `json:"channel"`
	AppID         string                `json:"appid"`
	MerchantID    string                `json:"merchantId"`
	OpenID        string                `json:"openid"`
	TransactionID string                `json:"transactionId,omitempty"`
	PrepayID      string                `json:"prepayId,omitempty"`
	RefundID      string                `json:"refundId,omitempty"`
	PaidAt        *time.Time            `json:"paidAt,omitempty"`
	ExpiresAt     time.Time             `json:"expiresAt"`
	RequestHash   string                `json:"requestHash"`
}
type Refund struct {
	Channel         string     `json:"channel,omitempty"`
	ProviderOrderID string     `json:"providerOrderId,omitempty"`
	OrderID         string     `json:"orderId"`
	UserID          string     `json:"userId"`
	AmountFen       int64      `json:"amountFen"`
	PointsUnits     int64      `json:"pointsUnits"`
	Status          string     `json:"status"`
	Reason          string     `json:"reason"`
	ProviderID      string     `json:"providerId,omitempty"`
	Error           string     `json:"error,omitempty"`
	CompletedAt     *time.Time `json:"completedAt,omitempty"`
}

// Virtual goods and environment are immutable order snapshots, not live catalog references.
type VirtualOrder struct {
	Quantity     int64  `json:"quantity,omitempty"`
	UnitFen      int64  `json:"unitFen,omitempty"`
	PurchaseMode string `json:"purchaseMode,omitempty"`
	ProductID    string `json:"productId"`
	ProductName  string `json:"productName"`
	PointsUnits  int64  `json:"pointsUnits"`
	Env          int    `json:"env"`
	Platform     string `json:"platform"`
	Issued       bool   `json:"issued"`
	Delivered    bool   `json:"delivered"`
}

func PointUnits(points float64) (int64, error) {
	if math.IsNaN(points) || math.IsInf(points, 0) || points < 0 || points > 1e9 {
		return 0, fmt.Errorf("积分价格无效")
	}
	return int64(math.Ceil(points*float64(PointScale) - 1e-8)), nil
}
