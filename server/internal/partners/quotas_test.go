package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
)

func fixture(t *testing.T) (*Service, context.Context, string, string) {
	t.Helper()
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	s1, e := s.Create(ctx, core.RootPartner, "S1", 9, "create-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	s2, e := s.Create(ctx, s1.ID, "S2", 1, "create-s2", "admin")
	if e != nil {
		t.Fatal(e)
	}
	return s, ctx, s1.ID, s2.ID
}
func TestSingleUserQuotaFlowsAcrossLevels(t *testing.T) {
	s, ctx, s1, s2 := fixture(t)
	if _, e := s.Create(ctx, s1, "S3", 3, "create-s3", "admin"); e != nil {
		t.Fatal(e)
	}
	parent, _ := s.Overview(ctx, s1)
	child, _ := s.Overview(ctx, s2)
	if parent.Quota.Users.Available() != 5 || child.Quota.Users.Available() != 1 {
		t.Fatal(parent.Quota, child.Quota)
	}
	if _, e := s.Transfer(ctx, core.QuotaMove{ParentID: core.RootPartner, ChildID: s2, Users: 1, Kind: "grant", Reason: "跳级划拨"}, "skip-tier", "admin"); e == nil {
		t.Fatal("skip-tier grant accepted")
	}
	var successes atomic.Int32
	var wg sync.WaitGroup
	for i := range 20 {
		wg.Go(func() {
			_, e := s.Issue(ctx, s1, "test", 7, fmt.Sprintf("reserve-%02d", i), "admin")
			if e == nil {
				successes.Add(1)
			} else if !errors.Is(e, core.ErrQuota) {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	if successes.Load() != 5 {
		t.Fatal("quota over-allocation", successes.Load())
	}
	parent, _ = s.Overview(ctx, s1)
	if parent.Quota.Users.Allocated != 4 || parent.Quota.Users.Reserved != 5 || parent.Quota.Users.Available() != 0 {
		t.Fatal(parent.Quota)
	}
}
func TestQuotaRequestApprovalIsAtomicAndVersioned(t *testing.T) {
	s, ctx, s1, s2 := fixture(t)
	request, e := s.RequestQuota(ctx, s2, 4, 0, "名额不足申请", "request-slots", "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.DecideRequest(ctx, request.ID, true, "同意划拨", request.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.DecideRequest(ctx, request.ID, true, "重复审批", request.Version, "admin"); !errors.Is(e, core.ErrConflict) {
		t.Fatal(e)
	}
	p, _ := s.Overview(ctx, s1)
	c, _ := s.Overview(ctx, s2)
	if p.Quota.Users.Available() != 4 || c.Quota.Users.Available() != 5 {
		t.Fatal(p.Quota, c.Quota)
	}
	code, e := s.Issue(ctx, s2, "reserve", 7, "reserved-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Transfer(ctx, core.QuotaMove{ParentID: s1, ChildID: s2, Users: 5, Kind: "reclaim", Reason: "收回名额"}, "bad-reclaim", "admin"); e == nil {
		t.Fatal("reserved quota reclaimed")
	}
	if e = s.Cancel(ctx, code.ID, "admin"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Transfer(ctx, core.QuotaMove{ParentID: s1, ChildID: s2, Users: 5, Kind: "reclaim", Reason: "收回名额"}, "valid-reclaim", "admin"); e != nil {
		t.Fatal(e)
	}
	c, _ = s.Overview(ctx, s2)
	if c.Quota.Users.Available() != 0 {
		t.Fatal(c.Quota)
	}
}

func TestConcurrentChildCreationCannotOverAllocate(t *testing.T) {
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	parent, err := s.Create(ctx, core.RootPartner, "S1", 10, "create-parent", "admin")
	if err != nil {
		t.Fatal(err)
	}
	var successes atomic.Int32
	var wg sync.WaitGroup
	for i := range 20 {
		wg.Go(func() {
			_, createErr := s.Create(ctx, parent.ID, fmt.Sprintf("C%02d", i), 1, fmt.Sprintf("create-child-%02d", i), "admin")
			if createErr == nil {
				successes.Add(1)
			} else if !errors.Is(createErr, core.ErrQuota) {
				t.Error(createErr)
			}
		})
	}
	wg.Wait()
	view, _ := s.Overview(ctx, parent.ID)
	rows, _ := s.Store.List(ctx, "partners", "")
	if successes.Load() != 10 || view.Quota.Users.Allocated != 10 || len(rows) != 11 {
		t.Fatal(successes.Load(), view.Quota, len(rows))
	}
}

func TestChildCreationUsesGrantedMinusUsedReservedAndAllocated(t *testing.T) {
	s := &Service{Store: store.NewMemory()}
	ctx := context.Background()
	parent, err := s.Create(ctx, core.RootPartner, "S1", 10, "formula-parent", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Create(ctx, parent.ID, "已下拨子级", 2, "formula-child", "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Issue(ctx, parent.ID, "预留额度", 7, "formula-reserved", "admin"); err != nil {
		t.Fatal(err)
	}
	usedCode, err := s.Issue(ctx, parent.ID, "已用额度", 7, "formula-used", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Store.Put(ctx, "users", core.Record{ID: "formula-user", Data: core.Data(map[string]string{"nickname": "测试用户"})}, 0); err != nil {
		t.Fatal(err)
	}
	token, _ := s.Reveal(ctx, usedCode.ID)
	if _, err = s.Redeem(ctx, "formula-user", token); err != nil {
		t.Fatal(err)
	}
	view, _ := s.Overview(ctx, parent.ID)
	if view.Quota.Users.Available() != 6 {
		t.Fatal(view.Quota)
	}
	if _, err = s.Create(ctx, parent.ID, "剩余额度子级", 6, "formula-remaining", "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Create(ctx, parent.ID, "超额子级", 1, "formula-over", "admin"); !errors.Is(err, core.ErrQuota) {
		t.Fatal("used, reserved or allocated quota was ignored", err)
	}
}
