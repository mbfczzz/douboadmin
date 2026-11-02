package core

import (
	"errors"
	"time"
)

const RootPartner = "root"

var ErrActivationRequired = errors.New("请先扫码或输入激活码完成授权")
var ErrQuota = errors.New("可用名额不足，请向上级申请")
var ErrPartnerDisabled = errors.New("所属服务商已停用，请联系管理员")
var ErrUserDisabled = errors.New("账号已停用，请联系管理员")

type Partner struct {
	Name            string   `json:"name"`
	ParentID        string   `json:"parentId"`
	Path            []string `json:"path"`
	Status          string   `json:"status"`
	RetailPer100Fen int64    `json:"retailPer100Fen"`
	ChildMarginBps  int64    `json:"childMarginBps"`
}
type QuotaPool struct {
	Granted   int64 `json:"granted"`
	Allocated int64 `json:"allocated"`
	Reserved  int64 `json:"reserved"`
	Used      int64 `json:"used"`
}

func (q QuotaPool) Available() int64 { return q.Granted - q.Allocated - q.Reserved - q.Used }

type PartnerQuota struct {
	Users    QuotaPool `json:"users"`
	Partners QuotaPool `json:"partners"`
}
type QuotaMove struct {
	ParentID string `json:"parentId"`
	ChildID  string `json:"childId"`
	Users    int64  `json:"users"`
	Partners int64  `json:"partners"`
	Kind     string `json:"kind"`
	Reason   string `json:"reason"`
	Actor    string `json:"actor"`
}
type QuotaRequest struct {
	PartnerID string `json:"partnerId"`
	ParentID  string `json:"parentId"`
	Users     int64  `json:"users"`
	Partners  int64  `json:"partners"`
	Status    string `json:"status"`
	Reason    string `json:"reason"`
	Decision  string `json:"decision,omitempty"`
}
type ActivationCode struct {
	CreatorAccount    string     `json:"creatorAccount,omitempty"`
	PartnerName       string     `json:"partnerName,omitempty"`
	ActivatedNickname string     `json:"activatedNickname,omitempty"`
	ActivationMethod  string     `json:"activationMethod,omitempty"`
	IssueID           string     `json:"issueId"`
	PartnerID         string     `json:"partnerId"`
	Label             string     `json:"label"`
	Suffix            string     `json:"suffix"`
	Status            string     `json:"status"`
	ExpiresAt         time.Time  `json:"expiresAt"`
	ExpiresUnix       int64      `json:"expiresUnix"`
	UserID            string     `json:"userId,omitempty"`
	UsedAt            *time.Time `json:"usedAt,omitempty"`
	Actor             string     `json:"actor"`
}
type Membership struct {
	PartnerID   string    `json:"partnerId"`
	Status      string    `json:"status"`
	CodeID      string    `json:"codeId"`
	ActivatedAt time.Time `json:"activatedAt"`
	ChangedAt   time.Time `json:"changedAt"`
	Reason      string    `json:"reason,omitempty"`
}
type Access struct {
	Active      bool   `json:"active"`
	Status      string `json:"status"`
	PartnerID   string `json:"partnerId,omitempty"`
	PartnerName string `json:"partnerName,omitempty"`
	Message     string `json:"message,omitempty"`
}
