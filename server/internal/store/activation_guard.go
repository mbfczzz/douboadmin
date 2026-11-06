package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
)

// Called after locking the user's wallet; matches activation/unbind's wallet -> tree order.
func requireActiveMember(tx Transaction, user string) error {
	if _, e := tx.Lock("partner_control", core.Record{ID: "tree", Data: core.Data(map[string]string{})}); e != nil {
		return e
	}
	row, e := tx.Get("users", user)
	if e != nil {
		return e
	}
	var profile *struct {
		Disabled bool `json:"disabled"`
		Archived bool `json:"archived"`
	}
	if json.Unmarshal(row.Data, &profile) != nil || profile == nil || profile.Disabled || profile.Archived {
		return core.ErrActivationRequired
	}
	if direct, err := tx.Get("direct_access", user); err == nil {
		var grant *core.DirectAccess
		if json.Unmarshal(direct.Data, &grant) != nil || grant == nil {
			return core.ErrActivationRequired
		}
		return nil
	} else if !errors.Is(err, core.ErrNotFound) {
		return err
	}
	row, e = tx.Get("memberships", user)
	if e != nil {
		return core.ErrActivationRequired
	}
	var member core.Membership
	if json.Unmarshal(row.Data, &member) != nil || member.Status != "active" {
		return core.ErrActivationRequired
	}
	id := member.PartnerID
	seen := map[string]bool{}
	for depth := 0; id != core.RootPartner; depth++ {
		if depth >= 8 || id == "" || seen[id] {
			return core.ErrActivationRequired
		}
		seen[id] = true
		row, e = tx.Get("partners", id)
		if e != nil {
			return core.ErrActivationRequired
		}
		var p core.Partner
		if json.Unmarshal(row.Data, &p) != nil || p.Status != "active" {
			return core.ErrActivationRequired
		}
		id = p.ParentID
	}
	return nil
}
