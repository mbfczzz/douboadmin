package core

import "time"

type Notification struct {
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	Content  string `json:"content"`
	TargetID string `json:"targetId,omitempty"`
	Read     bool   `json:"read"`
}
type WorkMeta struct {
	Featured   bool       `json:"featured"`
	FeaturedAt *time.Time `json:"featuredAt,omitempty"`
	Deleted    bool       `json:"deleted"`
	DeletedAt  *time.Time `json:"deletedAt,omitempty"`
	Title      string     `json:"title,omitempty"`
	// Blocked: WeChat's 内容安全 found the work risky; it is shown to no one
	// else (shares, 优秀作品).
	Blocked     bool   `json:"blocked,omitempty"`
	BlockReason string `json:"blockReason,omitempty"` // WeChat's label (色情, 广告…)
}
type Review struct {
	JobID      string     `json:"jobId"`
	Kind       string     `json:"kind"`
	Status     string     `json:"status"`
	Reason     string     `json:"reason,omitempty"`
	Reviewer   string     `json:"reviewer,omitempty"`
	ReviewedAt *time.Time `json:"reviewedAt,omitempty"`
}
type Share struct {
	JobID      string    `json:"jobId"`
	Title      string    `json:"title"`
	ShowPrompt bool      `json:"showPrompt"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

func IsWork(kind string) bool { return kind == "image" || kind == "video" || kind == "mix" }

func IsGeneration(kind string) bool {
	return kind == "image" || kind == "video" || kind == "chat" || kind == "audio"
}
