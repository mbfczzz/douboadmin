package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
)

// Older pending bind rejections were only logged as unbind_owner. Recover
// those decisions without changing a later registration using a fresh code.
func backfillUnboundCodes(ctx context.Context, s Store) error {
	q := core.RecordQuery{Namespace: "partner_audit", Fields: map[string]string{"kind": "unbind_owner"}, Page: 1, Size: 100, ByID: true}
	for {
		page, e := s.RecordPage(ctx, q)
		if e != nil {
			return e
		}
		for _, event := range page.Items {
			var payload struct {
				Data struct {
					User string `json:"user"`
				} `json:"data"`
			}
			if e = json.Unmarshal(event.Data, &payload); e != nil {
				return e
			}
			if payload.Data.User == "" {
				continue
			}
			uses := core.RecordQuery{Namespace: "code_uses", Owner: event.Owner, Fields: map[string]string{"userId": payload.Data.User, "codeKind": "bind"}, Status: "pending", Page: 1, Size: 100, ByID: true}
			for {
				rows, err := s.RecordPage(ctx, uses)
				if err != nil {
					return err
				}
				for _, row := range rows.Items {
					var use core.CodeUse
					if err = json.Unmarshal(row.Data, &use); err != nil {
						return err
					}
					if use.RegisteredAt.After(event.CreatedAt) {
						continue
					}
					at := event.CreatedAt
					use.Status, use.Reason, use.DecidedAt = "rejected", "后台已解除绑定", &at
					row.Data = core.Data(use)
					if _, err = s.Put(ctx, "code_uses", row, row.Version); err != nil {
						return err
					}
				}
				if len(rows.Items) < uses.Size {
					break
				}
				uses.AfterID = rows.Items[len(rows.Items)-1].ID
			}
		}
		if len(page.Items) < q.Size {
			return nil
		}
		q.AfterID = page.Items[len(page.Items)-1].ID
	}
}
