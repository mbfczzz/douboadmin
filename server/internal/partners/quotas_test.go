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
	s1, e := s.Create(ctx, core.RootPartner, "S1", "create-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	_, e = s.Transfer(ctx, core.QuotaMove{ParentID: core.RootPartner, ChildID: s1.ID, Users: 9, Kind: "grant", Reason: "初始划拨"}, "grant-s1", "admin")
	if e != nil {
		t.Fatal(e)
	}
	s2, e := s.Create(ctx, s1.ID, "S2", "create-s2", "admin")
	if e != nil {
		t.Fatal(e)
	}
	return s, ctx, s1.ID, s2.ID
}
func TestSingleUserQuotaFlowsAcrossLevels(t *testing.T) {
	s, ctx, s1, s2 := fixture(t)
	if _, e := s.Create(ctx, s1, "S3", "create-s3", "admin"); e != nil {
		t.Fatal("creating a provider consumed user quota", e)
	}
	if _, e := s.Issue(ctx, s2, "no quota", 7, "issue-empty", "admin"); !errors.Is(e, core.ErrQuota) {
		t.Fatal("new child inherited user slots", e)
	}
	_, e := s.Transfer(ctx, core.QuotaMove{ParentID: s1, ChildID: s2, Users: 3, Kind: "grant", Reason: "向下划拨"}, "grant-s2", "admin")
	if e != nil {
		t.Fatal(e)
	}
	parent, _ := s.Overview(ctx, s1)
	child, _ := s.Overview(ctx, s2)
	if parent.Quota.Users.Available() != 6 || child.Quota.Users.Available() != 3 {
		t.Fatal(parent.Quota, child.Quota)
	}
	if _, e = s.Transfer(ctx, core.QuotaMove{ParentID: core.RootPartner, ChildID: s2, Users: 1, Kind: "grant", Reason: "跳级划拨"}, "skip-tier", "admin"); e == nil {
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
	if successes.Load() != 6 {
		t.Fatal("quota over-allocation", successes.Load())
	}
	parent, _ = s.Overview(ctx, s1)
	if parent.Quota.Users.Reserved != 6 || parent.Quota.Users.Available() != 0 {
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
	if p.Quota.Users.Available() != 5 || c.Quota.Users.Available() != 4 {
		t.Fatal(p.Quota, c.Quota)
	}
	code, e := s.Issue(ctx, s2, "reserve", 7, "reserved-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Transfer(ctx, core.QuotaMove{ParentID: s1, ChildID: s2, Users: 4, Kind: "reclaim", Reason: "收回名额"}, "bad-reclaim", "admin"); e == nil {
		t.Fatal("reserved quota reclaimed")
	}
	if e = s.Cancel(ctx, code.ID, "admin"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Transfer(ctx, core.QuotaMove{ParentID: s1, ChildID: s2, Users: 4, Kind: "reclaim", Reason: "收回名额"}, "valid-reclaim", "admin"); e != nil {
		t.Fatal(e)
	}
	c, _ = s.Overview(ctx, s2)
	if c.Quota.Users.Available() != 0 {
		t.Fatal(c.Quota)
	}
}
