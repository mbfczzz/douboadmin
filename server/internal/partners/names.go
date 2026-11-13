package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"strings"
)

// Call while holding the tree lock. This covers both interactive creation
// and scan registration, across API instances sharing MySQL.
func uniqueSiblingName(tx store.Transaction, id, parent, role, name string) error {
	rows, e := tx.Records("partners")
	if e != nil {
		return e
	}
	for _, row := range rows {
		if row.ID == id {
			continue
		}
		var p core.Partner
		if e = json.Unmarshal(row.Data, &p); e != nil {
			return e
		}
		if p.Status == "deleted" || p.Status == "rejected" {
			continue
		}
		if p.ParentID == parent && p.Role == role && strings.EqualFold(strings.TrimSpace(p.Name), strings.TrimSpace(name)) {
			return rulef("同一上级下已存在同级同名服务商，请使用其他名称")
		}
	}
	return nil
}
