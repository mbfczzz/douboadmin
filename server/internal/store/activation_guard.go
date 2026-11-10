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
	// A provider's own owner works under that provider once approved.
	if row, err := tx.Get("partner_owners", user); err == nil {
		var owner core.PartnerOwner
		if json.Unmarshal(row.Data, &owner) == nil && owner.PartnerID != "" {
			if owner.Status != "active" {
				return core.ErrActivationRequired
			}
			return activeProviders(tx, owner.PartnerID)
		}
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
	return activeProviders(tx, member.PartnerID)
}

// activeProviders checks every provider from id up to the platform is active.
func activeProviders(tx Transaction, id string) error {
	seen := map[string]bool{}
	for depth := 0; id != core.RootPartner; depth++ {
		if depth >= 8 || id == "" || seen[id] {
			return core.ErrActivationRequired
		}
		seen[id] = true
		row, e := tx.Get("partners", id)
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
