package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"testing"
)

func create(t *testing.T, s *Service, ctx context.Context, parent, name, role string) string {
	t.Helper()
	r, e := s.Create(ctx, parent, name, role, "create-"+name, "admin")
	if e != nil {
		t.Fatal(e)
	}
	return r.ID
}

// tiers builds 分公司 → S1 → S2 in the admin.
func tiers(t *testing.T) (s *Service, ctx context.Context, branch, s1, s2 string) {
	t.Helper()
	s, ctx = &Service{Store: store.NewMemory()}, context.Background()
	branch = create(t, s, ctx, core.RootPartner, "分公司", core.RoleBranch)
	s1 = create(t, s, ctx, branch, "S1", core.RoleS1)
	s2 = create(t, s, ctx, s1, "S2", core.RoleS2)
	return
}

// fixture is tiers without the 分公司.
func fixture(t *testing.T) (*Service, context.Context, string, string) {
	t.Helper()
	s, ctx, _, s1, s2 := tiers(t)
	return s, ctx, s1, s2
}

// addUsers stores registered profiles (nickname and name are the id).
func addUsers(t *testing.T, s *Service, ctx context.Context, ids ...string) {
	t.Helper()
	for _, id := range ids {
		if _, e := s.Store.Put(ctx, "users", core.Record{ID: id, Data: core.Data(map[string]string{"nickname": id, "name": id})}, 0); e != nil {
			t.Fatal(e)
		}
	}
}

// register scans a code: the user waits for the platform in "review".
func register(t *testing.T, s *Service, ctx context.Context, code, user string) core.Access {
	t.Helper()
	access, e := s.Join(ctx, user, code, "scan")
	if e != nil || access.Active || access.Status != "review" {
		t.Fatal("register", access, e)
	}
	return access
}

// decide approves or rejects the user's pending registration.
func decide(t *testing.T, s *Service, ctx context.Context, user string, approve bool) {
	t.Helper()
	row, e := s.Store.Get(ctx, "registrations", user)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Decide(ctx, user, approve, "资料不符", row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
}

// join registers a user with the provider's member code and approves them.
func join(t *testing.T, s *Service, ctx context.Context, partner, user string) core.Access {
	t.Helper()
	code, e := s.ShareCode(ctx, partner, "admin")
	if e != nil {
		t.Fatal(e)
	}
	register(t, s, ctx, code, user)
	decide(t, s, ctx, user, true)
	access, e := s.Access(ctx, user)
	if e != nil || !access.Active || access.PartnerID != partner {
		t.Fatal("join", access, e)
	}
	return access
}

// invite registers user through the parent's S1/S2 invite and approves the
// new provider, returning its id.
func invite(t *testing.T, s *Service, ctx context.Context, parent, kind, user string) string {
	t.Helper()
	code, e := s.Share(ctx, parent, kind, "admin")
	if e != nil {
		t.Fatal(e)
	}
	pending := register(t, s, ctx, code.Code, user)
	decide(t, s, ctx, user, true)
	access, e := s.Access(ctx, user)
	if e != nil || !access.Active || access.Status != "provider" || access.PartnerID != pending.PartnerID {
		t.Fatal("invite", access, e)
	}
	return access.PartnerID
}

func partnerOf(t *testing.T, s *Service, ctx context.Context, id string) core.Partner {
	t.Helper()
	_, p, e := node(reader{ctx, s.Store}, id)
	if e != nil {
		t.Fatal(e)
	}
	return p
}
