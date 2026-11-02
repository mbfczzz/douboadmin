package core

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

var ErrNotFound = errors.New("记录不存在")
var ErrConflict = errors.New("数据已发生变化，请刷新后重试")
var ErrIdempotency = errors.New("重复请求标识已用于其他参数")

type Record struct {
	ID        string          `json:"id"`
	Owner     string          `json:"owner,omitempty"`
	Version   int64           `json:"version"`
	Data      json.RawMessage `json:"data"`
	CreatedAt time.Time       `json:"createdAt"`
}
type Template struct {
	GenerationOptions
	Family         string `json:"family"`
	Deleted        bool   `json:"deleted,omitempty"`
	CoverAssetID   string `json:"coverAssetId,omitempty"`
	Preview        string `json:"preview,omitempty"`
	Title          string `json:"title"`
	Category       string `json:"category"`
	Kind           string `json:"kind"`
	Cover          string `json:"cover"`
	Prompt         string `json:"prompt"`
	Description    string `json:"description"`
	Published      bool   `json:"published"`
	Sort           int    `json:"sort"`
	RequiredImages int    `json:"requiredImages"`
}
type JobInput struct {
	ExpectedCostUnits *int64   `json:"expectedCostUnits,omitempty"`
	SourceID          string   `json:"sourceId,omitempty"`
	Voice             string   `json:"voice,omitempty"`
	Purpose           string   `json:"purpose,omitempty"`
	Quality           string   `json:"quality,omitempty"`
	Mode              string   `json:"mode,omitempty"`
	Kind              string   `json:"kind"`
	Prompt            string   `json:"prompt"`
	Model             string   `json:"model"`
	Resolution        string   `json:"resolution"`
	Ratio             string   `json:"ratio"`
	Duration          int      `json:"duration"`
	TemplateID        string   `json:"templateId,omitempty"`
	Assets            []string `json:"assets"`
	ParentID          string   `json:"parentId,omitempty"`
}
type Job struct {
	ActivationRequired  bool      `json:"-"`
	ResultAssetID       string    `json:"resultAssetId,omitempty"`
	CostUnits           int64     `json:"costUnits"`
	BillingState        string    `json:"billingState,omitempty"`
	EstimatedCostMicros *int64    `json:"estimatedCostMicros,omitempty"`
	HoldOnFailure       bool      `json:"-"`
	Stage               string    `json:"stage,omitempty"`
	Deleted             bool      `json:"deleted,omitempty"`
	ReviewStatus        string    `json:"reviewStatus,omitempty"`
	ModelName           string    `json:"modelName,omitempty"`
	Retryable           bool      `json:"retryable"`
	ID                  string    `json:"id"`
	UserID              string    `json:"userId"`
	Input               JobInput  `json:"input"`
	Status              string    `json:"status"`
	Progress            int       `json:"progress"`
	Result              string    `json:"result,omitempty"`
	Error               string    `json:"error,omitempty"`
	Demo                bool      `json:"demo"`
	Attempts            int       `json:"attempts"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
	Hash                string    `json:"-"`
	LeaseToken          string    `json:"-"`
	LeaseUntil          time.Time `json:"-"`
}

func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func Digest(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func NewJob(user, key string, input JobInput) Job {
	b, _ := json.Marshal(input)
	now := time.Now().UTC()
	return Job{ID: Digest(user + "\x00" + key)[:32], UserID: user, Input: input, Status: "queued", Hash: Digest(string(b)), CreatedAt: now, UpdatedAt: now}
}
func Data(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
