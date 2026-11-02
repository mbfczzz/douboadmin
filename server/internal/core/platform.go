package core

import "fmt"

type PlatformSettings struct {
	BillingEnabled    bool     `json:"billingEnabled"`
	RechargeEnabled   bool     `json:"rechargeEnabled"`
	PointsPerYuan     int64    `json:"pointsPerYuan"`
	MinRechargeFen    int64    `json:"minRechargeFen"`
	MaxRechargeFen    int64    `json:"maxRechargeFen"`
	MixPoints         float64  `json:"mixPoints"`
	ReviewRequired    bool     `json:"reviewRequired"`
	SupportText       string   `json:"supportText"`
	HotKeywords       []string `json:"hotKeywords"`
	TTSModel          string   `json:"ttsModel"`
	RewriteModel      string   `json:"rewriteModel"`
	AlarmFailures     int      `json:"alarmFailures"`
	AlarmQueueMinutes int      `json:"alarmQueueMinutes"`
}

func DefaultPlatform() PlatformSettings {
	return PlatformSettings{PointsPerYuan: 100, MinRechargeFen: 100, MaxRechargeFen: 100000, MixPoints: 10, ReviewRequired: true, HotKeywords: []string{}, AlarmFailures: 5, AlarmQueueMinutes: 10}
}
func (s PlatformSettings) Validate() error {
	if s.PointsPerYuan < 1 || s.PointsPerYuan > 100000 || s.MinRechargeFen < 1 || s.MaxRechargeFen < s.MinRechargeFen || s.MaxRechargeFen > 10000000 {
		return fmt.Errorf("充值兑换比例或金额范围无效")
	}
	if _, e := PointUnits(s.MixPoints); e != nil {
		return e
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

type MixInput struct {
	Narration         bool    `json:"narration"`
	RewriteModel      string  `json:"rewriteModel,omitempty"`
	AutoScenes        bool    `json:"autoScenes"`
	Transcribe        bool    `json:"transcribe"`
	Rewrite           bool    `json:"rewrite"`
	Voice             string  `json:"voice,omitempty"`
	TTSModel          string  `json:"ttsModel,omitempty"`
	Captions          bool    `json:"captions"`
	MusicID           string  `json:"musicId,omitempty"`
	MusicVolume       float64 `json:"musicVolume"`
	KeepOriginalAudio bool    `json:"keepOriginalAudio"`
}
