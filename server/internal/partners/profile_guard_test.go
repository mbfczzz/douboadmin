package partners

import (
	"doubo/server/internal/core"
	"testing"
)

func TestJoinRechecksProfileAfterAdmission(t *testing.T) {
	for _, raw := range []string{`{"nickname":"test","disabled":true}`, `{"nickname":"test","archived":true}`} {
		t.Run(raw, func(t *testing.T) {
			s, ctx, s1, _ := fixture(t)
			if _, e := s.Store.Put(ctx, "users", core.Record{ID: "guard-user", Data: []byte(raw)}, 0); e != nil {
				t.Fatal(e)
			}
			code, e := s.ShareCode(ctx, s1, "admin")
			if e != nil {
				t.Fatal(e)
			}
			if _, e = s.Join(ctx, "guard-user", code, "scan"); e == nil {
				t.Fatal("invalid or disabled profile registered")
			}
			for _, ns := range []string{"registrations", "memberships", "partner_owners"} {
				if _, e = s.Store.Get(ctx, ns, "guard-user"); e == nil {
					t.Fatal("refused registration left a record in", ns)
				}
			}
		})
	}
}
