package core

type DailyMetric struct {
	Date        string `json:"date"`
	NewUsers    int64  `json:"newUsers"`
	ActiveUsers int64  `json:"activeUsers"`
	Jobs        int64  `json:"jobs"`
	Succeeded   int64  `json:"succeeded"`
	Failed      int64  `json:"failed"`
	PaidFen     int64  `json:"paidFen"`
	RefundFen   int64  `json:"refundFen"`
	RevenueFen  int64  `json:"revenueFen"`
}
type ModelCost struct {
	Model           string `json:"model"`
	Calls           int64  `json:"calls"`
	Known           int64  `json:"known"`
	EstimatedMicros int64  `json:"estimatedMicros"`
}
type Dashboard struct {
	Days   []DailyMetric    `json:"days"`
	Models []ModelCost      `json:"models"`
	Events map[string]int64 `json:"events"`
	Period int              `json:"period"`
}
