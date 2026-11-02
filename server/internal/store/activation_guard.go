package store

import (
	"doubo/server/internal/core"
	"encoding/json"
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
	}
	if json.Unmarshal(row.Data, &profile) != nil || profile == nil || profile.Disabled {
		return core.ErrActivationRequired
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
