package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func putCodeHistory(t *testing.T, s Store, ns string, row core.Record) {
	t.Helper()
	if _, e := s.Put(t.Context(), ns, row, 0); e != nil {
		t.Fatal(e)
	}
}

func TestBackfillCodeUsesRestoresHistoricalAndCurrentRegistrations(t *testing.T) {
	s := NewMemory()
	at := time.Date(2026, 11, 1, 1, 0, 0, 123456789, time.UTC)
	for _, code := range []string{"ABCDEFGH", "WXYZ2345"} {
		putCodeHistory(t, s, "share_codes", core.Record{ID: code, Owner: "issuer", Data: core.Data(core.ShareCode{PartnerID: "issuer", Kind: "s1", Status: "revoked"})})
	}
	putCodeHistory(t, s, "users", core.Record{ID: "scanner", Data: core.Data(map[string]string{"nickname": "微信昵称"})})
	reg := core.Registration{Role: "s1", PartnerID: "child", ParentID: "issuer", CodeKind: "s1", Code: "ABCDEFGH", Name: "登记姓名", Phone: "13800138000", Status: "pending", Method: "scan", RegisteredAt: at}
	approved := reg
	decision := at.Add(time.Hour)
	approved.Status, approved.DecidedAt = "approved", &decision
	// Deliberately visit the final decision before its pending snapshot.
	for _, event := range []struct {
		id, kind string
		reg      core.Registration
	}{{"a", "registration_approved", approved}, {"z", "register", reg}} {
		putCodeHistory(t, s, "partner_audit", core.Record{ID: event.id, Owner: "scanner", Data: core.Data(map[string]any{"kind": event.kind, "data": event.reg})})
	}
	reg.Code, reg.RegisteredAt = "WXYZ2345", at.Add(2*time.Hour)
	putCodeHistory(t, s, "registrations", core.Record{ID: "scanner", Owner: "scanner", Data: core.Data(reg)})
	if e := BackfillCodeUses(t.Context(), s); e != nil {
		t.Fatal(e)
	}
	rows, _ := s.RecordPage(t.Context(), core.RecordQuery{Namespace: "code_uses", Owner: "issuer", Page: 1, Size: 20})
	if rows.Total != 2 {
		t.Fatal("old code lost after re-registration", rows.Total)
	}
	old, _ := s.Get(t.Context(), "code_uses", core.CodeUseID("scanner", "ABCDEFGH"))
	var use core.CodeUse
	_ = json.Unmarshal(old.Data, &use)
	if use.Status != "approved" || use.Nickname != "微信昵称" || use.Name != "登记姓名" || use.RegisteredAt.Nanosecond()%1000 != 0 {
		t.Fatal("wrong restored snapshot", use)
	}
	if e := BackfillCodeUses(t.Context(), s); e != nil {
		t.Fatal(e)
	}
	again, _ := s.Get(t.Context(), "code_uses", old.ID)
	if again.Version != old.Version {
		t.Fatal("migration is not idempotent")
	}
}

func TestBackfillCodeUsesPagesBeyondOneHundredRows(t *testing.T) {
	s := NewMemory()
	putCodeHistory(t, s, "share_codes", core.Record{ID: "ABCDEFGH", Data: core.Data(core.ShareCode{PartnerID: "issuer"})})
	for i := 0; i < 105; i++ {
		user := fmt.Sprintf("scanner-%03d", i)
		putCodeHistory(t, s, "registrations", core.Record{ID: user, Owner: user, Data: core.Data(core.Registration{Code: "ABCDEFGH", Role: "member", Status: "pending", RegisteredAt: time.Now()})})
	}
	if e := BackfillCodeUses(t.Context(), s); e != nil {
		t.Fatal(e)
	}
	rows, _ := s.RecordPage(t.Context(), core.RecordQuery{Namespace: "code_uses", Owner: "issuer", Page: 1, Size: 20})
	if rows.Total != 105 {
		t.Fatal("migration truncated records", rows.Total)
	}
}

func TestBackfillRecoversPendingBindUnbinding(t *testing.T) {
	s := NewMemory()
	at := time.Now().Add(-time.Hour)
	for _, code := range []string{"ABCDEFGH", "WXYZ2345"} {
		putCodeHistory(t, s, "share_codes", core.Record{ID: code, Data: core.Data(core.ShareCode{PartnerID: "issuer", Kind: "bind"})})
	}
	reg := core.Registration{Code: "ABCDEFGH", CodeKind: "bind", Role: "branch", PartnerID: "issuer", Status: "pending", RegisteredAt: at}
	putCodeHistory(t, s, "partner_audit", core.Record{ID: "register", Owner: "scanner", Data: core.Data(map[string]any{"kind": "register", "data": reg})})
	putCodeHistory(t, s, "partner_audit", core.Record{ID: "unbind", Owner: "issuer", CreatedAt: at.Add(time.Minute), Data: core.Data(map[string]any{"kind": "unbind_owner", "data": map[string]string{"user": "scanner"}})})
	// Memory records use their real insertion time for metadata.
	unbound, _ := s.Get(t.Context(), "partner_audit", "unbind")
	reg.Code, reg.RegisteredAt = "WXYZ2345", unbound.CreatedAt.Add(time.Minute)
	putCodeHistory(t, s, "registrations", core.Record{ID: "scanner", Owner: "scanner", Data: core.Data(reg)})
	if e := BackfillCodeUses(t.Context(), s); e != nil {
		t.Fatal(e)
	}
	old, _ := s.Get(t.Context(), "code_uses", core.CodeUseID("scanner", "ABCDEFGH"))
	var use core.CodeUse
	_ = json.Unmarshal(old.Data, &use)
	if use.Status != "rejected" || use.Reason != "后台已解除绑定" {
		t.Fatal("old unbind missing", use)
	}
	fresh, _ := s.Get(t.Context(), "code_uses", core.CodeUseID("scanner", "WXYZ2345"))
	use = core.CodeUse{}
	_ = json.Unmarshal(fresh.Data, &use)
	if use.Status != "pending" {
		t.Fatal("later bind incorrectly rejected")
	}
}
