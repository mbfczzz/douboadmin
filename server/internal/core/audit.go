package core

import "time"

// Log categories. Every HTTP request is one entry: "business" when it is a
// known write operation, "auth" for sign-in/out, otherwise "api". Upstream
// model calls are "model".
const (
	LogAPI      = "api"
	LogBusiness = "business"
	LogAuth     = "auth"
	LogModel    = "model"
)

// AuditEntry is one log line. Request/Response hold redacted, size-capped
// JSON text; names are resolved when the entry is written so reads are fast.
type AuditEntry struct {
	ID         string    `json:"id"`
	At         time.Time `json:"at"`
	Category   string    `json:"category"`
	Action     string    `json:"action,omitempty"`
	ActorType  string    `json:"actorType"` // admin|provider|user|guest|system
	ActorID    string    `json:"actorId,omitempty"`
	ActorName  string    `json:"actorName,omitempty"`
	TargetType string    `json:"targetType,omitempty"`
	TargetID   string    `json:"targetId,omitempty"`
	TargetName string    `json:"targetName,omitempty"`
	Method     string    `json:"method,omitempty"`
	Route      string    `json:"route,omitempty"`
	Path       string    `json:"path,omitempty"`
	Status     int       `json:"status"`
	DurationMs int       `json:"durationMs"`
	IP         string    `json:"ip,omitempty"`
	UserAgent  string    `json:"userAgent,omitempty"`
	Summary    string    `json:"summary,omitempty"`
	Request    string    `json:"request,omitempty"`
	Response   string    `json:"response,omitempty"`
	Error      string    `json:"error,omitempty"`
}

// AuditQuery filters a newest-first page. Before is the last id of the
// previous page (keyset paging, no OFFSET scans).
type AuditQuery struct {
	Categories []string
	Actor      string // actor id or name fragment
	Target     string // target id or name fragment
	Search     string // path, action or summary fragment
	Method     string
	Failed     *bool
	WritesOnly bool
	From, To   time.Time
	Before     string
	Limit      int
}

type AuditPage struct {
	Items []AuditEntry `json:"items"`
	Next  string       `json:"next,omitempty"`
}

// APIStats summarises HTTP traffic since a point in time.
type APIStats struct {
	Requests int64   `json:"requests"`
	Errors   int64   `json:"errors"` // status >= 500
	Rejected int64   `json:"rejected"`
	Slow     int64   `json:"slow"` // > 1s
	AvgMs    float64 `json:"avgMs"`
	Users    int64   `json:"users"`
}
