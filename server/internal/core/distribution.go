package core

type DistributionPolicy struct {
	Enabled        bool  `json:"enabled"`
	CostPer100Fen  int64 `json:"costPer100Fen"`
	RootMarginBps  int64 `json:"rootMarginBps"`
	TotalUserQuota int64 `json:"totalUserQuota"`
}

func DefaultDistributionPolicy() DistributionPolicy {
	return DistributionPolicy{CostPer100Fen: 8000, RootMarginBps: 5000}
}

type CommissionShare struct {
	PartnerID string `json:"partnerId"`
	Name      string `json:"name"`
	AmountFen int64  `json:"amountFen"`
}
type DistributionSnapshot struct {
	PartnerID       string            `json:"partnerId"`
	PricingVersion  string            `json:"pricingVersion"`
	RetailPer100Fen int64             `json:"retailPer100Fen"`
	CostFen         int64             `json:"costFen"`
	Shares          []CommissionShare `json:"shares"`
}
type CommissionAccount struct {
	BalanceFen int64 `json:"balanceFen"`
	HeldFen    int64 `json:"heldFen"`
	PaidOutFen int64 `json:"paidOutFen"`
}
type CommissionEntry struct {
	PartnerID    string `json:"partnerId"`
	OrderID      string `json:"orderId,omitempty"`
	RefundID     string `json:"refundId,omitempty"`
	Kind         string `json:"kind"`
	AmountFen    int64  `json:"amountFen"`
	HeldDelta    int64  `json:"heldDelta"`
	BalanceAfter int64  `json:"balanceAfter"`
	Note         string `json:"note"`
	Actor        string `json:"actor,omitempty"`
}
type CommissionPayout struct {
	PartnerID string `json:"partnerId"`
	AmountFen int64  `json:"amountFen"`
	Status    string `json:"status"`
	Reference string `json:"reference,omitempty"`
	Note      string `json:"note"`
	Actor     string `json:"actor"`
}
type CommissionSettlement struct {
	Status   string           `json:"status"`
	RefundID string           `json:"refundId,omitempty"`
	Held     map[string]int64 `json:"held"`
}
