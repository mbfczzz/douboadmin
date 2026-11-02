package partners

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
)

type userProfile struct {
	Nickname string `json:"nickname"`
	Disabled bool   `json:"disabled"`
}

// Call inside the wallet transaction so account suspension cannot race admission.
func enabledProfile(r Reader, user string) (*userProfile, error) {
	row, e := r.Get("users", user)
	if e != nil {
		return nil, e
	}
	var profile *userProfile
	if e = json.Unmarshal(row.Data, &profile); e != nil || profile == nil {
		return nil, fmt.Errorf("账号状态异常")
	}
	if profile.Disabled {
		return nil, core.ErrUserDisabled
	}
	return profile, nil
}
