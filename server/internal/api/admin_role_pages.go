package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
)

// Builtin roles precede stored custom roles. At most two SQL pages are needed
// for the custom portion when a builtin prefix shifts the requested offset.
func (a *Server) adminRolePage(w http.ResponseWriter, r *http.Request) {
	page, ok := providerPageNumber(w, r)
	if !ok {
		return
	}
	provider := identity(r).PartnerID != ""
	builtinIDs := []string{core.SuperAdminRole, "operator", "partner"}
	builtins := []roleView{}
	for _, id := range builtinIDs {
		role, found, e := a.adminRole(r.Context(), id)
		if e != nil {
			dbError(w, e)
			return
		}
		if !found || provider && role.Scope != core.RoleScopePartner {
			continue
		}
		version := int64(0)
		if row, e := a.Store.Get(r.Context(), rolesNamespace, id); e == nil {
			version = row.Version
		}
		builtins = append(builtins, roleView{ID: id, Version: version, Data: role})
	}
	query := core.RecordQuery{Namespace: rolesNamespace, NotIDs: builtinIDs, Fields: map[string]string{"deleted": "false"}, Page: 1, Size: 20}
	if provider {
		query.Fields["scope"] = core.RoleScopePartner
	}
	start := (page - 1) * 20
	customStart := max(0, start-len(builtins))
	query.Page = customStart/20 + 1
	records, e := a.Store.RecordPage(r.Context(), query)
	if e != nil {
		dbError(w, e)
		return
	}
	total := len(builtins) + records.Total
	items := []roleView{}
	if start < len(builtins) {
		items = append(items, builtins[start:min(start+20, len(builtins))]...)
	}
	rows := records.Items
	offset := customStart % 20
	if offset < len(rows) {
		rows = rows[offset:]
	} else {
		rows = nil
	}
	if len(rows)+len(items) < 20 && customStart+len(rows) < records.Total {
		query.Page++
		next, e := a.Store.RecordPage(r.Context(), query)
		if e != nil {
			dbError(w, e)
			return
		}
		rows = append(rows, next.Items...)
	}
	for _, row := range rows {
		if len(items) == 20 {
			break
		}
		var role core.AdminRole
		if e = json.Unmarshal(row.Data, &role); e != nil {
			dbError(w, e)
			return
		}
		items = append(items, roleView{ID: row.ID, Version: row.Version, Data: role})
	}
	if !provider {
		for i := range items {
			counts, e := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: "admin_accounts", Fields: map[string]string{"role": items[i].ID, "archived": "false"}, Page: 1, Size: 1})
			if e != nil {
				dbError(w, e)
				return
			}
			items[i].Accounts = counts.Total
		}
	}
	reply(w, 200, map[string]any{"items": items, "page": page, "size": 20, "total": total})
}
