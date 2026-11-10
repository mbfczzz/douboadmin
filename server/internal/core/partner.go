package core

import (
	"errors"
	"time"
)

const RootPartner = "root"

var ErrActivationRequired = errors.New("请扫描服务商的二维码登记，并等待上级开通")
var ErrPartnerDisabled = errors.New("所属服务商已停用，请联系管理员")
var ErrUserDisabled = errors.New("账号已停用，请联系管理员")

// Provider roles. Growth goes through QR codes: a 分公司 grows S1 and S2,
// an S1 grows S2, and every provider grows 会员.
const (
	RoleBranch = "branch"
	RoleS1     = "s1"
	RoleS2     = "s2"
)

type Partner struct {
	Name            string   `json:"name"`
	Role            string   `json:"role"`
	ParentID        string   `json:"parentId"`
	Path            []string `json:"path"`
	Status          string   `json:"status"` // pending until approved, active, disabled
	RetailPer100Fen int64    `json:"retailPer100Fen"`
	ChildMarginBps  int64    `json:"childMarginBps"`
	// OwnerUser is the mini-program user who became this provider by scanning
	// its parent's code; empty for providers created in the admin.
	OwnerUser string `json:"ownerUser,omitempty"`
}

// Registration is a mini-program user's request to join, made by scanning a
// code. Generation stays blocked until its direct parent approves it.
type Registration struct {
	Role      string `json:"role"`      // member, branch, s1 or s2
	PartnerID string `json:"partnerId"` // the provider joined, created or bound
	ParentID  string `json:"parentId,omitempty"`
	Referrer  string `json:"referrer,omitempty"` // member whose promo code was used
	CodeKind  string `json:"codeKind"`
	Code      string `json:"code"`
	Method    string `json:"method"`
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Status    string `json:"status"` // pending, approved or rejected
	// RegisteredAt is the latest scan; a rejected user may register again.
	RegisteredAt time.Time  `json:"registeredAt"`
	Reason       string     `json:"reason,omitempty"`
	DecidedBy    string     `json:"decidedBy,omitempty"`
	DecidedAt    *time.Time `json:"decidedAt,omitempty"`
}

// ShareCode is a long-lived join code carried by a QR code. Resetting
// retires the old code; users who joined keep their binding.
type ShareCode struct {
	PartnerID string `json:"partnerId"`
	// Kind: "" 会员开通码, "s1"/"s2" provider invites, "bind", "promo".
	Kind   string `json:"kind,omitempty"`
	User   string `json:"user,omitempty"` // a promo code's member
	Status string `json:"status"`         // active, reset or used
	Actor  string `json:"actor"`
}

// PartnerShare points a provider (or a member's promo code) at its current
// code.
type PartnerShare struct {
	Code string `json:"code"`
	// User is the mini-program account a bind code has linked.
	User string `json:"user,omitempty"`
}

// PartnerOwner links a mini-program user to the provider they run.
type PartnerOwner struct {
	PartnerID string `json:"partnerId"`
	Status    string `json:"status"` // pending or active
}
type Membership struct {
	PartnerID   string    `json:"partnerId"`
	Status      string    `json:"status"`
	CodeID      string    `json:"codeId"`
	Method      string    `json:"method,omitempty"`
	Referrer    string    `json:"referrer,omitempty"`
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
