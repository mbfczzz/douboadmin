package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
	"time"
)

func TestMySQLMigrateRestoresCodeUsage(t *testing.T) {
	s := mysqlFixture(t) // requires a dedicated MYSQL_TEST_DSN, never the app DB
	user, issuer, code := "uses-"+core.NewID(), "issuer-"+core.NewID(), core.NewID()[:8]
	id := core.CodeUseID(user, code)
	t.Cleanup(func() {
		_, _ = s.db.Exec("DELETE FROM code_uses WHERE id=?", id)
		_, _ = s.db.Exec("DELETE FROM registrations WHERE id=?", user)
		_, _ = s.db.Exec("DELETE FROM share_codes WHERE id=?", code)
	})
	putCodeHistory(t, s, "share_codes", core.Record{ID: code, Owner: issuer, Data: core.Data(core.ShareCode{PartnerID: issuer, Kind: "s1", Status: "active"})})
	reg := core.Registration{Code: code, CodeKind: "s1", Role: "s1", ParentID: issuer, PartnerID: "child", Name: "历史扫码用户", Phone: "13900139000", Status: "pending", RegisteredAt: time.Now().UTC(), Method: "scan"}
	putCodeHistory(t, s, "registrations", core.Record{ID: user, Owner: user, Data: core.Data(reg)})
	if e := s.Migrate(t.Context()); e != nil {
		t.Fatal(e)
	}
	row, e := s.Get(t.Context(), "code_uses", id)
	var use core.CodeUse
	if e != nil || json.Unmarshal(row.Data, &use) != nil || row.Owner != issuer || use.UserID != user || use.Status != "pending" {
		t.Fatal("SQL usage backfill failed", e)
	}
	if e = s.Migrate(t.Context()); e != nil {
		t.Fatal(e)
	}
	again, _ := s.Get(t.Context(), "code_uses", id)
	if again.Version != row.Version {
		t.Fatal("SQL migration changed a restored usage on rerun")
	}
}
