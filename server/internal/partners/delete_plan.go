package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
)

func deletionPlan(tx store.Transaction, id string) (out DeletePreview, selected []deletionRow, err error) {
	root, p, e := node(tx, id)
	if e != nil {
		return out, nil, e
	}
	if p.Status == "deleted" {
		return out, nil, core.ErrNotFound
	}
	out.Name = p.Name
	rows, e := tx.Records("partners")
	if e != nil {
		return out, nil, e
	}
	ids := map[string]bool{id: true}
	// Follow parent links rather than trusting cached paths; includes every depth.
	for changed := true; changed; {
		changed = false
		for _, row := range rows {
			var n core.Partner
			if e = json.Unmarshal(row.Data, &n); e != nil {
				return out, nil, e
			}
			if ids[n.ParentID] && !ids[row.ID] {
				ids[row.ID] = true
				changed = true
			}
		}
	}
	selected = []deletionRow{}
	fingerprints := []string{fmt.Sprintf("%s:%d", root.ID, root.Version)}
	for _, ns := range []string{"partners", "admin_accounts", "partner_owners", "memberships", "registrations", "share_codes", "branch_phones", "partner_bind_codes"} {
		records, e := tx.Records(ns)
		if e != nil {
			return out, nil, e
		}
		for _, row := range records {
			var data map[string]any
			if e = json.Unmarshal(row.Data, &data); e != nil {
				return out, nil, e
			}
			partner, _ := data["partnerId"].(string)
			match := ids[partner]
			if ns == "partners" {
				match = ids[row.ID] && data["status"] != "deleted"
			}
			if ns == "partner_bind_codes" {
				match = ids[row.ID]
			}
			if ns == "memberships" {
				status := data["status"]
				match = match && (status == "active" || status == "pending" || status == "disabled")
			}
			if !match {
				continue
			}
			if ns == "admin_accounts" && data["role"] == core.SuperAdminRole {
				return out, nil, rulef("结构关联超级管理员，不能删除")
			}
			selected = append(selected, deletionRow{ns, row, data})
			fingerprints = append(fingerprints, fmt.Sprintf("%s:%s:%d", ns, row.ID, row.Version))
			switch ns {
			case "partners":
				out.Providers++
			case "admin_accounts":
				if data["archived"] != true {
					out.Accounts++
				}
			case "memberships":
				if data["status"] != "unbound" {
					out.Members++
				}
			}
		}
	}
	users, e := deletionUsers(tx, selected, ids)
	if e != nil {
		return out, nil, e
	}
	for _, user := range users {
		selected = append(selected, user)
		fingerprints = append(fingerprints, fmt.Sprintf("users:%s:%d", user.row.ID, user.row.Version))
	}
	out.Users = len(users)
	out.Token = core.Digest(string(core.Data(fingerprints)))
	return out, selected, nil
}
