package partners

import (
	"doubo/server/internal/core"
	"testing"
)

func TestRedeemRechecksProfileAfterAdmission(t *testing.T) {
	for _, raw := range []string{`{"nickname":"test","disabled":true}`, `null`, `{"disabled":"broken"}`} {
		t.Run(raw, func(t *testing.T) {
			s, ctx, s1, _ := fixture(t)
			if _, e := s.Store.Put(ctx, "users", core.Record{ID: "guard-user", Data: []byte(raw)}, 0); e != nil {
				t.Fatal(e)
			}
			code, e := s.Issue(ctx, s1, "guard", 7, "profile-code", "admin")
			if e != nil {
				t.Fatal(e)
			}
			token, e := s.Reveal(ctx, code.ID)
			if e != nil {
				t.Fatal(e)
			}
			if _, e = s.Redeem(ctx, "guard-user", token); e == nil {
				t.Fatal("invalid or disabled profile consumed activation quota")
			}
			after, e := s.Overview(ctx, s1)
			if e != nil {
				t.Fatal(e)
			}
			if after.Quota.Users.Used != 0 || after.Quota.Users.Reserved != 1 {
				t.Fatal("rejected redemption changed quota", after.Quota)
			}
		})
	}
}
