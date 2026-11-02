package core

import "fmt"

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
	return PlatformSettings{PointsPerYuan: 100, MinRechargeFen: 100, MaxRechargeFen: 100000, ReviewRequired: true, HotKeywords: []string{}, AlarmFailures: 5, AlarmQueueMinutes: 10}
}
func (s PlatformSettings) Validate() error {
	if s.PointsPerYuan < 1 || s.PointsPerYuan > 100000 || s.MinRechargeFen < 1 || s.MaxRechargeFen < s.MinRechargeFen || s.MaxRechargeFen > 10000000 {
		return fmt.Errorf("充值兑换比例或金额范围无效")
	}
	if len([]rune(s.SupportText)) > 500 || len(s.HotKeywords) > 20 || s.AlarmFailures < 1 || s.AlarmQueueMinutes < 1 {
		return fmt.Errorf("平台设置无效")
	}
	for _, word := range s.HotKeywords {
		if len([]rune(word)) > 50 {
			return fmt.Errorf("推荐关键词不能超过 50 字")
		}
	}
	return nil
}

type UserPreferences struct {
	InAppNotifications     bool `json:"inAppNotifications"`
	CompletionSubscription bool `json:"completionSubscription"`
	Autoplay               bool `json:"autoplay"`
	Analytics              bool `json:"analytics"`
}

func DefaultPreferences() UserPreferences { return UserPreferences{InAppNotifications: true} }
