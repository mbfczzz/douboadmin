package partners

import (
	"context"
	"database/sql"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"os"
	"slices"
	"testing"

	_ "github.com/go-sql-driver/mysql"
)

// The admin user list filters by access in the store; it must label every
// user exactly as Access does, on both drivers.
func TestUserPageAccessMatchesAccess(t *testing.T) {
	t.Run("memory", func(t *testing.T) { userPageScenario(t, store.NewMemory()) })
	t.Run("mysql", func(t *testing.T) {
		dsn := os.Getenv("PARTNERS_MYSQL_TEST_DSN")
		if dsn == "" {
			t.Skip("PARTNERS_MYSQL_TEST_DSN required")
		}
		db, e := store.NewMySQL(dsn)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { db.Close() })
		if e = db.Migrate(t.Context()); e != nil {
			t.Fatal(e)
		}
		raw, e := sql.Open("mysql", dsn)
		if e != nil {
			t.Fatal(e)
		}
		defer raw.Close()
		for _, table := range store.Tables() {
			if _, e = raw.Exec("DELETE FROM `" + table.Name + "`"); e != nil {
				t.Fatal(e)
			}
		}
		userPageScenario(t, db)
	})
}

func userPageScenario(t *testing.T, st store.Store) {
	s, ctx := &Service{Store: st}, context.Background()
	branch := create(t, s, ctx, core.RootPartner, "分公司", core.RoleBranch)
	s1 := create(t, s, ctx, branch, "S1", core.RoleS1)
	other := create(t, s, ctx, core.RootPartner, "停用分公司", core.RoleBranch)
	otherS1 := create(t, s, ctx, other, "停用 S1", core.RoleS1)
	users := []string{"none", "member", "member-review", "rejected", "owner", "owner-review", "chain-off"}
	addUsers(t, s, ctx, users...)
	join(t, s, ctx, s1, "member")
	join(t, s, ctx, otherS1, "chain-off")
	code, e := s.ShareCode(ctx, s1, "admin")
	if e != nil {
		t.Fatal(e)
	}
	register(t, s, ctx, code, "member-review")
	register(t, s, ctx, code, "rejected")
	decide(t, s, ctx, "rejected", false)
	invite(t, s, ctx, s1, S2Code, "owner")
	invite2, e := s.Share(ctx, s1, S2Code, "admin")
	if e != nil {
		t.Fatal(e)
	}
	register(t, s, ctx, invite2.Code, "owner-review")
	row, p, e := node(reader{ctx, st}, other)
	if e != nil {
		t.Fatal(e)
	}
	p.Status = "disabled"
	if _, e = s.Update(ctx, other, p, row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
	want := map[string][]string{}
	for _, u := range users {
		a, e := s.Access(ctx, u)
		if e != nil {
			t.Fatal(u, e)
		}
		kind := "none"
		if a.Active && a.Status == "provider" {
			kind = "owner"
		} else if a.Active {
			kind = "member"
		} else if a.Status == "review" {
			kind = "review"
		}
		want[kind] = append(want[kind], u)
	}
	for _, kind := range []string{"member", "owner", "review", "none"} {
		page, e := st.UserPage(ctx, core.UserQuery{Access: kind, Page: 1, Size: 100})
		if e != nil {
			t.Fatal(e)
		}
		got := []string{}
		for _, r := range page.Items {
			got = append(got, r.ID)
		}
		slices.Sort(got)
		slices.Sort(want[kind])
		if !slices.Equal(got, want[kind]) || page.Total != len(got) {
			t.Errorf("%s: got %v want %v", kind, got, want[kind])
		}
	}
	if !slices.Contains(want["none"], "chain-off") || !slices.Contains(want["owner"], "owner") {
		t.Fatal("scenario lost a case", want)
	}
	page, e := st.UserPage(ctx, core.UserQuery{Search: "REVIEW", State: "active", Page: 2, Size: 1})
	if e != nil || page.Total != 2 || len(page.Items) != 1 {
		t.Fatal("search, state and paging", page, e)
	}
}
