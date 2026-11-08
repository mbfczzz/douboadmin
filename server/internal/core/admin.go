package core

import "time"

type AdminAccount struct {
	Username          string    `json:"username"`
	Name              string    `json:"name"`
	Phone             string    `json:"phone,omitempty"`
	Role              string    `json:"role"`
	PartnerID         string    `json:"partnerId,omitempty"`
	PasswordHash      string    `json:"passwordHash,omitempty"`
	Disabled          bool      `json:"disabled,omitempty"`
	Archived          bool      `json:"archived,omitempty"`
	LastLoginAt       time.Time `json:"lastLoginAt,omitempty"`
	PasswordChangedAt time.Time `json:"passwordChangedAt"`
	CreatedBy         string    `json:"createdBy"`
}

type DirectAccess struct {
	ActivatedAt time.Time `json:"activatedAt"`
}
