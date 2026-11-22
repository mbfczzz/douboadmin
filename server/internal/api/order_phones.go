package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
)

// addOrderPhones enriches admin responses in one users query. Order records
// stay unchanged, and user-facing order responses never include the phone.
func (a *Server) addOrderPhones(ctx context.Context, rows []core.Record) error {
	ids := []string{}
	seen := map[string]bool{}
	for _, row := range rows {
		var order core.Order
		if json.Unmarshal(row.Data, &order) == nil && order.UserID != "" && !seen[order.UserID] {
			seen[order.UserID] = true
			ids = append(ids, order.UserID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	page, err := a.Store.RecordPage(ctx, core.RecordQuery{Namespace: "users", IDs: ids, Page: 1, Size: len(ids)})
	if err != nil {
		return err
	}
	phones := map[string]string{}
	for _, row := range page.Items {
		var profile struct {
			Phone         string `json:"phone"`
			VerifiedPhone string `json:"verifiedPhone"`
		}
		if json.Unmarshal(row.Data, &profile) == nil {
			phones[row.ID] = profile.VerifiedPhone
			if phones[row.ID] == "" {
				phones[row.ID] = profile.Phone
			}
		}
	}
	for i := range rows {
		var order core.Order
		if json.Unmarshal(rows[i].Data, &order) == nil {
			order.Phone = phones[order.UserID]
			rows[i].Data = core.Data(order)
		}
	}
	return nil
}
