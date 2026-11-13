package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestSiblingNamesTrimCaseScopeAndRename(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	first, e := s.Create(ctx, branch, " Alpha ", core.RoleS1, "name-first", "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Create(ctx, branch, "alpha", core.RoleS1, "name-duplicate", "admin"); e == nil || !strings.Contains(e.Error(), "同名") {
		t.Fatal("duplicate accepted", e)
	}
	replay, e := s.Create(ctx, branch, " Alpha ", core.RoleS1, "name-first", "admin")
	if e != nil || replay.ID != first.ID {
		t.Fatal("idempotent retry rejected", e)
	}
	second, e := s.Create(ctx, branch, "Beta", core.RoleS1, "name-second", "admin")
	if e != nil {
		t.Fatal(e)
	}
	var p core.Partner
	json.Unmarshal(second.Data, &p)
	p.Name = "ALPHA"
	if _, e = s.Update(ctx, second.ID, p, second.Version, "admin"); e == nil {
		t.Fatal("rename bypassed uniqueness")
	}
	p.Name = "Beta"
	if _, e = s.Update(ctx, second.ID, p, second.Version, "admin"); e != nil {
		t.Fatal("unchanged name rejected", e)
	}
	parent := create(t, s, ctx, core.RootPartner, "不同分公司", core.RoleBranch)
	if _, e = s.Create(ctx, parent, "Alpha", core.RoleS1, "name-other-parent", "admin"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Create(ctx, branch, "Alpha", core.RoleS2, "name-other-role", "admin"); e != nil {
		t.Fatal(e)
	}
}

func TestConcurrentSiblingNameCreatesOnlyOne(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, e := s.Create(ctx, branch, "并发服务商", core.RoleS1, fmt.Sprintf("parallel-name-%d", i), "admin")
			if e == nil {
				accepted.Add(1)
			} else if !strings.Contains(e.Error(), "同名") {
				t.Error(e)
			}
		}(i)
	}
	wg.Wait()
	if accepted.Load() != 1 {
		t.Fatal("duplicate race", accepted.Load())
	}
}

func TestPendingDisabledNamesReservedAndClosedNamesReusable(t *testing.T) {
	for _, status := range []string{"active", "pending", "disabled", "rejected", "deleted"} {
		t.Run(status, func(t *testing.T) {
			s, ctx, branch, _, _ := tiers(t)
			_, e := s.Store.Put(ctx, "partners", core.Record{ID: "existing", Owner: branch, Data: core.Data(core.Partner{Name: "测试同名", Role: core.RoleS1, ParentID: branch, Status: status})}, 0)
			if e != nil {
				t.Fatal(e)
			}
			_, e = s.Create(ctx, branch, "测试同名", core.RoleS1, "replacement-name", "admin")
			if (e == nil) != (status == "rejected" || status == "deleted") {
				t.Fatal(status, e)
			}
		})
	}
}

func TestScanDuplicateDoesNotLeaveRegistrationOrOwner(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "first-user", "second-user")
	for _, id := range []string{"first-user", "second-user"} {
		row, _ := s.Store.Get(ctx, "users", id)
		row.Data = core.Data(map[string]string{"name": "扫码重名用户", "nickname": id})
		s.Store.Put(ctx, "users", row, row.Version)
	}
	code, e := s.Share(ctx, branch, core.RoleS1, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Join(ctx, "first-user", code.Code, "scan"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Join(ctx, "second-user", code.Code, "scan"); e == nil || !strings.Contains(e.Error(), "同名") {
		t.Fatal(e)
	}
	for _, ns := range []string{"registrations", "partner_owners"} {
		if _, e = s.Store.Get(ctx, ns, "second-user"); e == nil {
			t.Fatal("partial registration persisted")
		}
	}
}

func TestDuplicateBeyondFirst500RecordsIsRejected(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	if e := s.Store.Atomic(ctx, func(tx store.Transaction) error {
		for i := 0; i < 505; i++ {
			_, e := tx.Put("partners", core.Record{ID: fmt.Sprintf("seed-%04d", i), Owner: branch, Data: core.Data(core.Partner{Name: fmt.Sprintf("完整检查%d", i), Role: core.RoleS1, ParentID: branch, Status: "active"})}, 0)
			if e != nil {
				return e
			}
		}
		return nil
	}); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Create(ctx, branch, "完整检查0", core.RoleS1, "duplicate-oldest", "admin"); e == nil {
		t.Fatal("500-row truncation")
	}
}
