package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"strings"
)

type DeletePreview struct {
	Name      string `json:"name"`
	Providers int    `json:"providers"`
	Accounts  int    `json:"accounts"`
	Members   int    `json:"members"`
	Users     int    `json:"users"`
	Token     string `json:"token"`
}

var ErrDeleteAccess = errors.New("当前账号已无删除权限，请刷新后重试")

type deletionRow struct {
	ns   string
	row  core.Record
	data map[string]any
}

// Both preview and commit serialize with identity creation and tree edits.
func (s *Service) DeleteTree(ctx context.Context, id, token, reason, actor string, commit bool) (out DeletePreview, err error) {
	if id == core.RootPartner || id == "" {
		return out, rulef("平台总账号不能删除")
	}
	if commit && (len([]rune(strings.TrimSpace(reason))) < 3 || len([]rune(reason)) > 200) {
		return out, rulef("请填写3–200字的删除原因")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, e := tx.Lock("identity_control", core.Record{ID: "accounts", Data: core.Data(map[string]any{})}); e != nil {
			return e
		}
		if commit {
			initial, selected, e := deletionPlan(tx, id)
			if e != nil {
				return e
			}
			if token == "" || token != initial.Token {
				return core.ErrConflict
			}
			for _, item := range selected {
				if item.ns == "users" {
					if _, _, e = store.LockWallet(tx, item.row.ID); e != nil {
						return e
					}
				}
			}
		}
		if e := Lock(tx); e != nil {
			return e
		}
		login, e := tx.Lock("admin_accounts", core.Record{ID: actor})
		if e != nil {
			return e
		}
		var account core.AdminAccount
		if e = json.Unmarshal(login.Data, &account); e != nil {
			return e
		}
		if account.Role != core.SuperAdminRole || account.Disabled || account.Archived {
			return ErrDeleteAccess
		}
		plan, selected, e := deletionPlan(tx, id)
		if e != nil {
			return e
		}
		out = plan

		if !commit {
			return nil
		}
		if token == "" || token != out.Token {
			return core.ErrConflict
		}
		for _, item := range selected {
			if item.ns == "users" {
				e = archiveDeletionUser(tx, item, reason, actor)
			} else {
				e = deleteTreeRecord(tx, item, reason)
			}
			if e != nil {
				return e
			}
		}
		return audit(tx, id, "delete_partner_tree", actor, reason, out)
	})
	return
}

func deleteTreeRecord(tx store.Transaction, item deletionRow, reason string) error {
	data := item.data
	switch item.ns {
	case "partners":
		data["status"] = "deleted"
	case "admin_accounts":
		data["archived"], data["disabled"] = true, true
	case "partner_owners":
		data["partnerId"], data["status"] = "", ""
	case "memberships":
		data["status"], data["reason"], data["changedAt"] = "unbound", reason, nowUTC()
	case "registrations":
		if data["status"] != "pending" {
			return nil
		}
		data["status"], data["reason"], data["decidedBy"], data["decidedAt"] = "rejected", reason, "system:delete-tree", nowUTC()
		var reg core.Registration
		if e := json.Unmarshal(core.Data(data), &reg); e != nil {
			return e
		}
		if e := saveCodeUse(tx, item.row.ID, reg); e != nil {
			return e
		}
	case "share_codes":
		data["status"] = "reset"
	case "branch_phones":
		data = map[string]any{}
	case "partner_bind_codes":
		data["user"] = ""
	}
	item.row.Data = core.Data(data)
	_, e := tx.Put(item.ns, item.row, item.row.Version)
	return e
}
