package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"sort"
)

func deletionUsers(tx store.Transaction, selected []deletionRow, partners map[string]bool) ([]deletionRow, error) {
	candidates := map[string]bool{}
	add := func(value any) {
		if id, ok := value.(string); ok && id != "" {
			candidates[id] = true
		}
	}
	for _, item := range selected {
		switch item.ns {
		case "memberships", "partner_owners":
			add(item.row.ID)
		case "registrations":
			if item.data["status"] == "pending" {
				add(item.row.ID)
			}
		case "partners":
			add(item.data["ownerUser"])
		case "admin_accounts":
			if item.data["archived"] != true {
				add(item.data["userId"])
			}
		}
	}
	// Historical records must never cause deletion of a user now in another tree.
	for _, ns := range []string{"partner_owners", "memberships", "admin_accounts"} {
		rows, e := tx.Records(ns)
		if e != nil {
			return nil, e
		}
		for _, row := range rows {
			var data map[string]any
			if e = json.Unmarshal(row.Data, &data); e != nil {
				return nil, e
			}
			user := row.ID
			if ns == "admin_accounts" {
				user, _ = data["userId"].(string)
				if data["archived"] == true {
					continue
				}
			} else {
				status := data["status"]
				if status != "active" && status != "pending" && status != "disabled" {
					continue
				}
			}
			if !candidates[user] {
				continue
			}
			partner, _ := data["partnerId"].(string)
			if !partners[partner] || data["role"] == core.SuperAdminRole {
				return nil, rulef("待删除用户同时关联其他结构或平台后台账号，请先核对归属")
			}
		}
	}
	ids := []string{}
	for id := range candidates {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := []deletionRow{}
	for _, id := range ids {
		row, e := tx.Get("users", id)
		if errors.Is(e, core.ErrNotFound) {
			continue
		}
		if e != nil {
			return nil, e
		}
		var data map[string]any
		if e = json.Unmarshal(row.Data, &data); e != nil {
			return nil, e
		}
		if data["archived"] == true {
			continue
		}
		out = append(out, deletionRow{"users", row, data})
	}
	return out, nil
}

func archiveDeletionUser(tx store.Transaction, item deletionRow, reason, actor string) error {
	for _, field := range []string{"phone", "verifiedPhone"} {
		phone, _ := item.data[field].(string)
		if phone == "" {
			continue
		}
		owner, e := tx.Get("phone_owners", phone)
		if errors.Is(e, core.ErrNotFound) {
			continue
		}
		if e != nil {
			return e
		}
		var data map[string]any
		if e = json.Unmarshal(owner.Data, &data); e != nil {
			return e
		}
		if data["user"] != item.row.ID {
			continue
		}
		owner.Data = core.Data(map[string]string{"user": ""})
		if _, e = tx.Put("phone_owners", owner, owner.Version); e != nil {
			return e
		}
	}
	item.data["disabled"], item.data["archived"], item.data["statusReason"] = true, true, reason
	item.row.Data = core.Data(item.data)
	if _, e := tx.Put("users", item.row, item.row.Version); e != nil {
		return e
	}
	_, e := tx.Put("user_audit", core.Record{ID: core.NewID(), Owner: item.row.ID, Data: core.Data(map[string]any{"actor": actor, "kind": "archive", "reason": "服务商结构删除：" + reason})}, 0)
	return e
}
