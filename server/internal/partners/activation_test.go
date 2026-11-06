package partners

import (
	"doubo/server/internal/core"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestActivationSingleUseDisableAndUnbind(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	for _, id := range []string{"a", "b"} {
		_, _ = s.Store.Put(ctx, "users", core.Record{ID: id, Data: core.Data(map[string]string{"nickname": id})}, 0)
	}
	row, e := s.Issue(ctx, s1, "single", 7, "single-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	repeated, e := s.Issue(ctx, s1, "single", 7, "single-code", "admin")
	if e != nil || repeated.ID != row.ID {
		t.Fatal(repeated, e)
	}
	code, e := s.Reveal(ctx, row.ID)
	if e != nil {
		t.Fatal(e)
	}
	var wins atomic.Int32
	var wg sync.WaitGroup
	for _, id := range []string{"a", "b"} {
		wg.Go(func() {
			if access, e := s.Redeem(ctx, id, code); e == nil && access.Active {
				wins.Add(1)
			}
		})
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatal("single code activated twice", wins.Load())
	}
	saved, _ := s.Store.Get(ctx, "activation_codes", row.ID)
	var grant core.ActivationCode
	_ = json.Unmarshal(saved.Data, &grant)
	user := grant.UserID
	if access, e := s.Redeem(ctx, user, code); e != nil || !access.Active {
		t.Fatal("own retry failed", access, e)
	}
	binding, _ := s.Store.Get(ctx, "memberships", user)
	disabled, e := s.ChangeMembership(ctx, user, "disabled", "暂停授权", "admin", binding.Version)
	if e != nil {
		t.Fatal(e)
	}
	p, _ := s.Overview(ctx, s1)
	if p.Quota.Users.Used != 1 || p.Quota.Users.Reserved != 0 {
		t.Fatal(p.Quota)
	}
	if access, e := s.Redeem(ctx, user, code); e != nil || access.Active {
		t.Fatal("old code re-enabled account", access, e)
	}
	if _, e = s.ChangeMembership(ctx, user, "unbound", "解除绑定", "admin", disabled.Version); e != nil {
		t.Fatal(e)
	}
	p, _ = s.Overview(ctx, s1)
	if p.Quota.Users.Used != 0 || p.Quota.Users.Available() != 8 {
		t.Fatal(p.Quota)
	}
	if access, e := s.Redeem(ctx, user, code); e != nil || access.Active {
		t.Fatal("old code rebound account", access, e)
	}
}
func TestExpiredCodesReleaseExactlyOneReservation(t *testing.T) {
	s, ctx, s1, _ := fixture(t)
	row, e := s.Issue(ctx, s1, "expire", 1, "expiry-code", "admin")
	if e != nil {
		t.Fatal(e)
	}
	var v core.ActivationCode
	_ = json.Unmarshal(row.Data, &v)
	v.ExpiresAt = time.Now().Add(-time.Minute)
	v.ExpiresUnix = v.ExpiresAt.Unix()
	row.Data = core.Data(v)
	if _, e = s.Store.Put(ctx, "activation_codes", row, row.Version); e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			if e := s.Expire(ctx); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	p, _ := s.Overview(ctx, s1)
	if p.Quota.Users.Reserved != 0 || p.Quota.Users.Available() != 8 {
		t.Fatal(p.Quota)
	}
	if _, e = s.Reveal(ctx, row.ID); e == nil {
		t.Fatal("expired code revealed")
	}
}
