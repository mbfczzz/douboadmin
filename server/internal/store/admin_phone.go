package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"strings"
)

// Match MySQL's unique index in the isolated memory store, including transactions.
// Disabled accounts keep their number; archived accounts release it.
func checkAdminPhone(records map[string]core.Record, ns string, row core.Record) error {
	if ns != "admin_accounts" {
		return nil
	}
	var next core.AdminAccount
	if err := json.Unmarshal(row.Data, &next); err != nil {
		return err
	}
	phone := strings.TrimSpace(next.Phone)
	if next.Archived || phone == "" {
		return nil
	}
	for key, other := range records {
		if !strings.HasPrefix(key, "admin_accounts:") || other.ID == row.ID {
			continue
		}
		var account core.AdminAccount
		if err := json.Unmarshal(other.Data, &account); err != nil {
			return err
		}
		if !account.Archived && strings.TrimSpace(account.Phone) == phone {
			return core.ErrAdminPhoneTaken
		}
	}
	return nil
}
