package store

import (
	"doubo/server/internal/core"
	"os"
	"testing"
)

// The Agent project table and the project filter on the job list, on MySQL.
func TestMySQLAgentSessionsAndSessionJobFilter(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEMP_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEMP_TEST_DSN enables the Agent project SQL check")
	}
	m, err := NewMySQL(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	ctx := t.Context()
	if err = m.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	s := core.AgentSession{Title: "项目", Skill: "store", Assets: []string{"a", "b"}}
	row, err := m.Put(ctx, "agent_sessions", core.Record{ID: core.NewID(), Owner: "sql-user", Data: core.Data(s)}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := m.Get(ctx, "agent_sessions", row.ID); err != nil || got.Owner != "sql-user" {
		t.Fatal(got, err)
	}
	for _, session := range []string{row.ID, ""} {
		j := core.NewJob("sql-user", core.NewID(), core.JobInput{Kind: "chat", Prompt: "p", SessionID: session, Assets: []string{}})
		if _, err = m.CreateJob(ctx, j); err != nil {
			t.Fatal(err)
		}
	}
	page, err := m.JobPage(ctx, core.JobQuery{User: "sql-user", Session: row.ID, Page: 1, Size: 20})
	if err != nil || page.Total != 1 || page.Items[0].Input.SessionID != row.ID {
		t.Fatal(page, err)
	}
	// Chat outside projects: only jobs without a project.
	page, err = m.JobPage(ctx, core.JobQuery{User: "sql-user", NoSession: true, Page: 1, Size: 100})
	if err != nil || page.Total == 0 {
		t.Fatal(page, err)
	}
	for _, j := range page.Items {
		if j.Input.SessionID != "" {
			t.Fatal("a project job in plain chat", j.Input.SessionID)
		}
	}
}
