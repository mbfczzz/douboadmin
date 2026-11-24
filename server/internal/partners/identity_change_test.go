package partners

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"testing"
)

func TestProviderVisitorRoundTripPreservesTreeAndLogin(t *testing.T) {
	s, ctx, branch, _, _ := tiers(t)
	addUsers(t, s, ctx, "boss")
	provider := invite(t, s, ctx, branch, S1Code, "boss")
	child, err := s.Create(ctx, provider, "保留下级", core.RoleS2, "identity-child", "admin")
	if err != nil {
		t.Fatal(err)
	}
	account := core.AdminAccount{UserID: "boss", Username: "boss-login", Role: core.RoleS1, PartnerID: provider}
	if _, err = s.Store.Put(ctx, "admin_accounts", core.Record{ID: "boss-login", Data: core.Data(account)}, 0); err != nil {
		t.Fatal(err)
	}
	before, err := s.IdentityAssignment(ctx, "boss")
	if err != nil || before.Kind != core.RoleS1 || before.ParentID != branch || !before.HasChildren {
		t.Fatal(before, err)
	}
	visitor, err := s.ChangeIdentity(ctx, "boss", core.RoleVisitor, "", "admin", before.Version)
	if err != nil || visitor.Kind != core.RoleVisitor || visitor.PreviousKind != core.RoleS1 || visitor.PreviousPartner != provider {
		t.Fatal(visitor, err)
	}
	if access, _ := s.Access(ctx, "boss"); access.Active || access.Status != "review" {
		t.Fatal(access)
	}
	_, owner, _ := get[core.PartnerOwner](reader{ctx, s.Store}, "partner_owners", "boss")
	_, node, _ := get[core.Partner](reader{ctx, s.Store}, "partners", provider)
	_, keptChild, _ := get[core.Partner](reader{ctx, s.Store}, "partners", child.ID)
	if owner.Status != "visitor" || node.Status != "active" || node.ParentID != branch || keptChild.ParentID != provider {
		t.Fatal(owner, node, keptChild)
	}
	row, _ := s.Store.Get(ctx, "admin_accounts", "boss-login")
	if json.Unmarshal(row.Data, &account) != nil || !account.Disabled {
		t.Fatal("provider login not paused", string(row.Data))
	}
	restored, err := s.ChangeIdentity(ctx, "boss", core.RoleS1, branch, "admin", visitor.Version)
	if err != nil || restored.Kind != core.RoleS1 || restored.PartnerID != provider {
		t.Fatal(restored, err)
	}
	row, _ = s.Store.Get(ctx, "admin_accounts", "boss-login")
	account = core.AdminAccount{}
	if json.Unmarshal(row.Data, &account) != nil || account.Disabled {
		t.Fatal("provider login not restored", string(row.Data))
	}
	if _, err = s.ChangeIdentity(ctx, "boss", core.RoleS2, branch, "admin", restored.Version); err == nil {
		t.Fatal("existing provider changed level")
	}
}

func TestMemberVisitorConversionKeepsAndCanChangeParent(t *testing.T) {
	s, ctx, branch, s1, s2 := tiers(t)
	addUsers(t, s, ctx, "member", "new-provider")
	join(t, s, ctx, s1, "member")
	current, _ := s.IdentityAssignment(ctx, "member")
	visitor, err := s.ChangeIdentity(ctx, "member", core.RoleVisitor, "", "admin", current.Version)
	if err != nil || visitor.Kind != core.RoleVisitor || visitor.MemberPartner != s1 {
		t.Fatal(visitor, err)
	}
	_, membership, _ := get[core.Membership](reader{ctx, s.Store}, "memberships", "member")
	if membership.Status != "visitor" || membership.PartnerID != s1 {
		t.Fatal(membership)
	}
	member, err := s.ChangeIdentity(ctx, "member", core.RoleMember, s2, "admin", visitor.Version)
	if err != nil || member.Kind != core.RoleMember || member.PartnerID != s2 {
		t.Fatal(member, err)
	}
	_, membership, _ = get[core.Membership](reader{ctx, s.Store}, "memberships", "member")
	if membership.Status != "active" || membership.PartnerID != s2 {
		t.Fatal(membership)
	}
	created, err := s.ChangeIdentity(ctx, "new-provider", core.RoleS1, branch, "admin", 0)
	if err != nil || created.Kind != core.RoleS1 || created.ParentID != branch {
		t.Fatal(created, err)
	}
}

func TestLegacyDirectAccessCannotBypassVisitorOverlay(t *testing.T) {
	s, ctx, _, _, _ := tiers(t)
	addUsers(t, s, ctx, "legacy-direct")
	if _, err := s.ActivateDirect(ctx, "legacy-direct"); err != nil {
		t.Fatal(err)
	}
	current, _ := s.IdentityAssignment(ctx, "legacy-direct")
	if _, err := s.ChangeIdentity(ctx, "legacy-direct", core.RoleVisitor, "", "admin", current.Version); err != nil {
		t.Fatal(err)
	}
	job := core.NewJob("legacy-direct", "visitor-block", core.JobInput{Kind: "image"})
	job.ActivationRequired = true
	if _, err := s.Store.CreateJob(ctx, job); !errors.Is(err, core.ErrActivationRequired) {
		t.Fatal("legacy direct access bypassed visitor", err)
	}
}
