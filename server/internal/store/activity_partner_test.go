package store

import (
	"doubo/server/internal/core"
	"strings"
	"testing"
)

func TestActivitySQLUsesBoundPartnerScope(t *testing.T) {
	q, args := logWhere(core.AuditQuery{PartnerID: "scope"})
	if len(args) != 3 || strings.Count(q, "?") != 3 || !strings.Contains(q, "admin_accounts") || !strings.Contains(q, "partner_owners") || !strings.Contains(q, "memberships") {
		t.Fatal(q, args)
	}
	q, args = logWhere(core.AuditQuery{PartnerID: "scope", MembersOnly: true})
	if len(args) != 1 || strings.Contains(q, "admin_accounts") || strings.Contains(q, "partner_owners") || !strings.Contains(q, "actor_type='user'") {
		t.Fatal(q, args)
	}
	if !strings.Contains(q, "'active','pending','disabled'") {
		t.Fatal("detached memberships must be excluded")
	}
}
