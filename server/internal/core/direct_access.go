package core

import "time"

// DirectAccess grants a registered user platform access without a provider.
type DirectAccess struct {
	ActivatedAt time.Time `json:"activatedAt"`
}
