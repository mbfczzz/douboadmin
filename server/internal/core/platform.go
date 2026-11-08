package core

type PlatformSettings struct {
	BillingEnabled    bool     `json:"billingEnabled"`
	RechargeEnabled   bool     `json:"rechargeEnabled"`
	PointsPerYuan     int64    `json:"pointsPerYuan"`
	MinRechargeFen    int64    `json:"minRechargeFen"`
	MaxRechargeFen    int64    `json:"maxRechargeFen"`
	ReviewRequired    bool     `json:"reviewRequired"`
	SupportText       string   `json:"supportText"`
	HotKeywords       []string `json:"hotKeywords"`
	AlarmFailures     int      `json:"alarmFailures"`
	AlarmQueueMinutes int      `json:"alarmQueueMinutes"`
}

func DefaultPlatform() PlatformSettings {
	// Compatibility response for older clients. Business overrides have retired.
	return PlatformSettings{BillingEnabled: true, RechargeEnabled: true, PointsPerYuan: 100, MinRechargeFen: 1, MaxRechargeFen: MaxOrderAmountFen, ReviewRequired: true, HotKeywords: []string{}, AlarmFailures: 5, AlarmQueueMinutes: 10}
}

type UserPreferences struct {
	InAppNotifications     bool `json:"inAppNotifications"`
	CompletionSubscription bool `json:"completionSubscription"`
	Autoplay               bool `json:"autoplay"`
	Analytics              bool `json:"analytics"`
}

func DefaultPreferences() UserPreferences { return UserPreferences{InAppNotifications: true} }
