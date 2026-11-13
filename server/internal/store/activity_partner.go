package store

import (
	"doubo/server/internal/core"
	"encoding/json"
)

// Caller holds the memory store lock; SQL uses the equivalent indexed predicates.
func (m *Memory) activityPartner(e core.AuditEntry, id string, membersOnly bool) bool {
	namespaces := []string{}
	if e.ActorType == "user" {
		namespaces = []string{"partner_owners", "memberships"}
	}
	if e.ActorType == "admin" || e.ActorType == "provider" {
		namespaces = []string{"admin_accounts"}
	}
	if membersOnly {
		if e.ActorType != "user" {
			return false
		}
		namespaces = []string{"memberships"}
	}
	for _, ns := range namespaces {
		var data struct {
			PartnerID string `json:"partnerId"`
			Status    string `json:"status"`
		}
		_ = json.Unmarshal(m.records[ns+":"+e.ActorID].Data, &data)
		if data.PartnerID == id && (e.ActorType != "user" || data.Status == "active" || data.Status == "pending" || data.Status == "disabled") {
			return true
		}
	}
	return false
}
