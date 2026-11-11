package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
)

// The provider screen may use its default login; the unified account list
// must target the exact row clicked, including historical additional logins.
func (a *Server) selectedProviderAccount(ctx context.Context, partnerID, accountID string) (core.Record, core.AdminAccount, bool, error) {
	if accountID == "" {
		return a.providerAccount(ctx, partnerID)
	}
	row, err := a.Store.Get(ctx, "admin_accounts", accountID)
	if err != nil {
		return core.Record{}, core.AdminAccount{}, false, err
	}
	var account core.AdminAccount
	if err := json.Unmarshal(row.Data, &account); err != nil {
		return core.Record{}, account, false, err
	}
	if account.PartnerID != partnerID || account.Archived {
		return core.Record{}, core.AdminAccount{}, false, core.ErrNotFound
	}
	return row, account, true, nil
}
