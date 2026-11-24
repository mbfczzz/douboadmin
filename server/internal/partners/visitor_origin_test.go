package partners

import (
	"doubo/server/internal/core"
	"testing"
)

func TestRegistrationVisitorOrigin(t *testing.T) {
	cases := []struct {
		registration core.Registration
		want         string
	}{
		{core.Registration{Role: core.RoleVisitor, Method: "direct"}, "direct"},
		{core.Registration{Role: core.RoleVisitor, Method: "scan"}, "scan"},
		{core.Registration{Role: core.RoleVisitor, Method: "code"}, "code"},
		{core.Registration{Role: core.RoleVisitor, Code: "ABCD2345"}, "scan"},
		{core.Registration{Role: core.RoleMember, Method: "scan"}, ""},
	}
	for _, item := range cases {
		if got := registrationVisitorOrigin(item.registration); got != item.want {
			t.Fatalf("origin %q, want %q for %+v", got, item.want, item.registration)
		}
	}
}
