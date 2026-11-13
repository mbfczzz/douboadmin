package store

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"strings"
)

// The admin user list pages and filters in the database. Access follows
// partners.Access as the list labels it: a bound provider owner comes first
// (review while pending, owner while its provider chain is active), then
// the membership (review while pending, member while active under an active
// chain), else none. partners' tests hold both drivers to partners.Access.

var userStates = map[string]string{
	"current":  "COALESCE(u.archived,0)=0",
	"active":   "COALESCE(u.archived,0)=0 AND COALESCE(u.disabled,0)=0",
	"disabled": "COALESCE(u.archived,0)=0 AND u.disabled=1",
	"archived": "u.archived=1",
}

// chainActive: the provider and every ancestor on its path are active.
func chainActive(partner string) string {
	return fmt.Sprintf(`(%[1]s='root' OR EXISTS(SELECT 1 FROM partners p WHERE p.id=%[1]s AND p.status='active'
		AND NOT EXISTS(SELECT 1 FROM partners a WHERE a.status<>'active' AND JSON_CONTAINS(p.path, JSON_QUOTE(a.id)))))`, partner)
}

var userAccess = `CASE
	WHEN o.id IS NOT NULL THEN IF(o.status='pending','review',IF(` + chainActive("o.partner_id") + `,'owner','none'))
	WHEN m.status='pending' THEN 'review'
	WHEN m.status='active' AND ` + chainActive("m.partner_id") + ` THEN 'member'
	ELSE 'none' END`

func (m *MySQL) UserPage(ctx context.Context, q core.UserQuery) (out core.RecordPage, err error) {
	out = core.RecordPage{Items: []core.Record{}, Page: q.Page, Size: q.Size}
	t, err := tableOf("users")
	if err != nil || !q.Valid() {
		return out, fmt.Errorf("invalid user page")
	}
	from := ` FROM users u LEFT JOIN partner_owners o ON o.id=u.id AND o.partner_id<>'' LEFT JOIN memberships m ON m.id=u.id WHERE 1=1`
	args := []any{}
	if q.Search != "" {
		from += ` AND LOCATE(?, CONCAT_WS(' ', u.id, u.nickname, u.name, u.phone))>0`
		args = append(args, q.Search)
	}
	if q.State != "" {
		from += ` AND ` + userStates[q.State]
	}
	if q.Access != "" {
		from += ` AND (` + userAccess + `)=?`
		args = append(args, q.Access)
	}
	tx, err := m.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*)`+from, args...).Scan(&out.Total); err != nil {
		return out, err
	}
	query := `SELECT ` + t.selectAs("u") + from + ` ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`
	if out.Items, err = listRows(ctx, tx, query, t, append(args, q.Size, (q.Page-1)*q.Size)...); err != nil {
		return out, err
	}
	return out, tx.Commit()
}

// userRow is what the memory list reads of a user and its provider links.
type userRow struct {
	Nickname, Name, Phone string
	Disabled, Archived    bool
	PartnerID, Status     string
	Path                  []string
}

func (m *Memory) UserPage(_ context.Context, q core.UserQuery) (out core.RecordPage, err error) {
	out = core.RecordPage{Items: []core.Record{}, Page: q.Page, Size: q.Size}
	if !q.Valid() {
		return out, fmt.Errorf("invalid user page")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	items := []core.Record{}
	for key, row := range m.records {
		if key != "users:"+row.ID {
			continue
		}
		u := m.decode(key)
		text := strings.ToLower(strings.Join([]string{row.ID, u.Nickname, u.Name, u.Phone}, " "))
		state := map[bool]string{true: "disabled", false: "active"}[u.Disabled]
		if u.Archived {
			state = "archived"
		}
		if !strings.Contains(text, strings.ToLower(q.Search)) || (q.State == "current" && state == "archived") || (q.State != "" && q.State != "current" && q.State != state) ||
			(q.Access != "" && q.Access != m.accessOf(row.ID)) {
			continue
		}
		items = append(items, copyRecord(row))
	}
	sortNewest(items)
	out.Total = len(items)
	if start := (q.Page - 1) * q.Size; start < len(items) {
		out.Items = items[start:min(start+q.Size, len(items))]
	}
	return out, nil
}

func (m *Memory) accessOf(user string) string {
	if o := m.decode("partner_owners:" + user); o.PartnerID != "" {
		if o.Status == "pending" {
			return "review"
		}
		return map[bool]string{true: "owner", false: "none"}[m.chainActive(o.PartnerID)]
	}
	switch v := m.decode("memberships:" + user); {
	case v.Status == "pending":
		return "review"
	case v.Status == "active" && m.chainActive(v.PartnerID):
		return "member"
	}
	return "none"
}

func (m *Memory) chainActive(partner string) bool {
	if partner == core.RootPartner {
		return true
	}
	if _, ok := m.records["partners:"+partner]; !ok || m.decode("partners:"+partner).Status != "active" {
		return false
	}
	for _, id := range m.decode("partners:" + partner).Path {
		if _, ok := m.records["partners:"+id]; ok && m.decode("partners:"+id).Status != "active" {
			return false
		}
	}
	return true
}

// decode reads the fields userRow knows from a stored record ("" if absent).
func (m *Memory) decode(key string) (v userRow) {
	if r, ok := m.records[key]; ok {
		_ = json.Unmarshal(r.Data, &v) // keys match the fields case-insensitively
	}
	return v
}
