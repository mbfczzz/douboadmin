package core

import "time"

// One durable registration per user and QR value, owned by the code issuer.
// Approval is recorded here independently of the user's latest registration.
type CodeUse struct {
	UserID       string     `json:"userId"`
	Nickname     string     `json:"nickname"`
	Name         string     `json:"name"`
	Phone        string     `json:"phone"`
	Code         string     `json:"code"`
	CodeKind     string     `json:"codeKind"`
	Role         string     `json:"role"`
	PartnerID    string     `json:"partnerId"`
	Referrer     string     `json:"referrer,omitempty"`
	Method       string     `json:"method"`
	Status       string     `json:"status"`
	Reason       string     `json:"reason,omitempty"`
	RegisteredAt time.Time  `json:"registeredAt"`
	DecidedAt    *time.Time `json:"decidedAt,omitempty"`
}

func CodeUseID(user, code string) string { return Digest("code-use:" + user + ":" + code)[:32] }

func CodeUseFromRegistration(user, nickname string, reg Registration) CodeUse {
	use := CodeUse{UserID: user, Nickname: nickname, Name: reg.Name, Phone: reg.Phone, Code: reg.Code, CodeKind: reg.CodeKind, Role: reg.Role, PartnerID: reg.PartnerID, Referrer: reg.Referrer, Method: reg.Method, Status: reg.Status, Reason: reg.Reason, RegisteredAt: reg.RegisteredAt.UTC().Truncate(time.Microsecond)}
	if reg.DecidedAt != nil {
		at := reg.DecidedAt.UTC().Truncate(time.Microsecond)
		use.DecidedAt = &at
	}
	return use
}
