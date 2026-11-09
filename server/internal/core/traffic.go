package core

import "time"

// Client kinds counted in visit statistics. Records written before the
// field existed came from the mini-program.
const (
	ClientMiniProgram = "miniprogram"
	ClientWeb         = "web"
	ClientApp         = "app"
)

// VisitClient reads a stored client, defaulting old records.
func VisitClient(c string) string {
	if c == "" {
		return ClientMiniProgram
	}
	return c
}

// Visit is one anonymous session (namespace "visits") on one client. It is
// keyed by a digest of the client's random visit id and never carries the
// account id; Visitor is a digest of the client's random visitor id.
type Visit struct {
	Client   string           `json:"client,omitempty"`
	Source   string           `json:"source,omitempty"` // web referrer/channel, app channel
	Day      string           `json:"day"`
	Visitor  string           `json:"visitor"`
	Scene    int              `json:"scene"`
	Platform string           `json:"platform"`
	Entry    string           `json:"entry"`
	Pages    int64            `json:"pages"`
	Counts   map[string]int64 `json:"counts"`
	FirstAt  time.Time        `json:"firstAt"`
	LastAt   time.Time        `json:"lastAt"`
}

// Visitor marks the first day an anonymous visitor was seen ("visitors").
type Visitor struct {
	FirstDay string `json:"firstDay"`
	Client   string `json:"client,omitempty"`
}

type PageStat struct {
	Page string `json:"page"`
	PV   int64  `json:"pv"`
	UV   int64  `json:"uv"`
}
type EntryStat struct {
	Page   string `json:"page"`
	Visits int64  `json:"visits"`
}
type SceneStat struct {
	Scene  int   `json:"scene"`
	Visits int64 `json:"visits"`
}
type SourceStat struct {
	Source string `json:"source"`
	Visits int64  `json:"visits"`
}

// ClientStat is one client's share of all visits.
type ClientStat struct {
	Client string `json:"client"`
	PV     int64  `json:"pv"`
	UV     int64  `json:"uv"`
	Visits int64  `json:"visits"`
}
type PlatformStat struct {
	Platform string `json:"platform"`
	Visits   int64  `json:"visits"`
}

// Traffic summarises anonymous page visits within the report period.
// Rates are ratios in [0, 1]; RetentionBase is the user-day count behind
// NextDayRetention (zero means there is nothing to compare yet).
type Traffic struct {
	PV               int64          `json:"pv"`
	UV               int64          `json:"uv"`
	Visits           int64          `json:"visits"`
	PagesPerVisit    float64        `json:"pagesPerVisit"`
	AvgVisitSeconds  int64          `json:"avgVisitSeconds"`
	BounceRate       float64        `json:"bounceRate"`
	NewVisitors      int64          `json:"newVisitors"`
	NextDayRetention float64        `json:"nextDayRetention"`
	RetentionBase    int64          `json:"retentionBase"`
	TopPages         []PageStat     `json:"topPages"`
	EntryPages       []EntryStat    `json:"entryPages"`
	Scenes           []SceneStat    `json:"scenes"`
	Sources          []SourceStat   `json:"sources"`
	Platforms        []PlatformStat `json:"platforms"`
	// Only on the all-clients total: each client's share.
	Clients []ClientStat `json:"clients,omitempty"`
}
