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
	PaidOrders  int64  `json:"paidOrders"`
	// Points (hundredths) charged for jobs that succeeded that day.
	SpentUnits int64 `json:"spentUnits"`
}
type ModelCost struct {
	Model           string `json:"model"`
	Calls           int64  `json:"calls"`
	Known           int64  `json:"known"`
	EstimatedMicros int64  `json:"estimatedMicros"`
}
type Dashboard struct {
	Days      []DailyMetric    `json:"days"`
	Models    []ModelCost      `json:"models"`
	Events    map[string]int64 `json:"events"`
	Period    int              `json:"period"`
	Breakdown Breakdown        `json:"breakdown"`
}

// KindStat summarises one generation type within the report period.
type KindStat struct {
	Jobs       int64 `json:"jobs"`
	Succeeded  int64 `json:"succeeded"`
	Failed     int64 `json:"failed"`
	SpentUnits int64 `json:"spentUnits"`
	// Total and count of succeeded run times, for an average duration.
	DurationMs int64 `json:"durationMs"`
	Timed      int64 `json:"timed"`
}
type ChannelStat struct {
	Orders    int64 `json:"orders"`
	AmountFen int64 `json:"amountFen"`
}
type ProviderStat struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Activations int64  `json:"activations"`
}

// Breakdown holds period totals across users, generation, revenue and providers.
type Breakdown struct {
	TotalUsers          int64                   `json:"totalUsers"`
	ActiveUsers         int64                   `json:"activeUsers"`
	CreatorUsers        int64                   `json:"creatorUsers"`
	Payers              int64                   `json:"payers"`
	Kinds               map[string]*KindStat    `json:"kinds"`
	Hours               [24]int64               `json:"hours"`
	Weekdays            [7]int64                `json:"weekdays"`
	OrdersCreated       int64                   `json:"ordersCreated"`
	OrdersPaid          int64                   `json:"ordersPaid"`
	PointsSold          int64                   `json:"pointsSold"`
	Channels            map[string]*ChannelStat `json:"channels"`
	Refunds             int64                   `json:"refunds"`
	DirectActivations   int64                   `json:"directActivations"`
	ProviderActivations int64                   `json:"providerActivations"`
	CodesIssued         int64                   `json:"codesIssued"`
	CodesRedeemed       int64                   `json:"codesRedeemed"`
	Providers           []ProviderStat          `json:"providers"`
}
