package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
)

// The unified list contains platform and provider logins, never mini-program
// user sessions. Provider metadata is read only for this page and is not saved
// into the account. Repeated providers share one lookup.
func (a *Server) adminAccountListView(ctx context.Context, row core.Record, partners map[string]core.Partner) (core.Record, error) {
	row = a.adminView(ctx, row)
	var account core.AdminAccount
	if err := json.Unmarshal(row.Data, &account); err != nil {
		return core.Record{}, err
	}
	if account.PartnerID == "" {
		return row, nil
	}
	partner, found := partners[account.PartnerID]
	if !found {
		record, err := a.Store.Get(ctx, "partners", account.PartnerID)
		if err != nil && !errors.Is(err, core.ErrNotFound) {
			return core.Record{}, err
		}
		if err == nil {
			if err := json.Unmarshal(record.Data, &partner); err != nil {
				return core.Record{}, err
			}
		}
		partners[account.PartnerID] = partner
	}
	row.Data = core.Data(struct {
		core.AdminAccount
		PartnerName string `json:"partnerName,omitempty"`
		PartnerRole string `json:"partnerRole,omitempty"`
	}{account, partner.Name, partner.Role})
	return row, nil
}
