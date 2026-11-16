package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

type managedExecutionFixture struct {
	Phase          string `json:"phase"`
	Error          string `json:"error"`
	ErrorType      string `json:"errorType"`
	ErrorAction    string `json:"errorAction"`
	UpstreamCode   string `json:"upstreamCode"`
	UpstreamType   string `json:"upstreamType"`
	ErrorCode      int    `json:"errorCode"`
	ErrorRetryable bool   `json:"errorRetryable"`
	ErrorEditable  bool   `json:"errorEditable"`
}

func managedExecutionRecord() core.Record {
	return core.Record{ID: "managed-fields", Data: core.Data(managedExecutionFixture{Phase: "failed", Error: "用户提示", ErrorCode: 5002, ErrorType: "safety_policy", ErrorAction: "调整内容", UpstreamCode: "vendor-code", UpstreamType: "vendor-type", ErrorEditable: true})}
}

func assertManagedExecution(t *testing.T, raw []byte) {
	t.Helper()
	var got managedExecutionFixture
	if json.Unmarshal(raw, &got) != nil || got.ErrorCode != 5002 || got.ErrorType != "safety_policy" || got.ErrorAction == "" || got.UpstreamCode != "vendor-code" || got.UpstreamType != "vendor-type" || got.ErrorRetryable || !got.ErrorEditable {
		t.Fatalf("round trip: %+v", got)
	}
}

func TestMemoryExecutionManagedFieldsRoundTrip(t *testing.T) {
	memory := NewMemory()
	row, err := memory.Put(t.Context(), "executions", managedExecutionRecord(), 0)
	if err != nil {
		t.Fatal(err)
	}
	assertManagedExecution(t, row.Data)
}

// Uses only a connection-local temporary table and never touches business rows.
func TestMySQLExecutionManagedFieldsTemporaryTable(t *testing.T) {
	dsn := os.Getenv("MYSQL_TEMP_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEMP_TEST_DSN enables temporary-table schema regression")
	}
	mysql, err := NewMySQL(dsn)
	if err != nil {
		t.Fatal("invalid database configuration")
	}
	defer mysql.Close()
	conn, err := mysql.db.Conn(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	table, err := tableOf("executions")
	if err != nil {
		t.Fatal(err)
	}
	ddl := strings.Replace(table.DDL(), "CREATE TABLE IF NOT EXISTS", "CREATE TEMPORARY TABLE", 1)
	if _, err = conn.ExecContext(t.Context(), ddl); err != nil {
		t.Fatal(err)
	}
	tx, err := conn.BeginTx(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err = putRow(t.Context(), tx, "executions", managedExecutionRecord(), 0); err != nil {
		t.Fatal(err)
	}
	row, err := getRow(t.Context(), tx, "executions", "managed-fields", "")
	if err != nil {
		t.Fatal(err)
	}
	assertManagedExecution(t, row.Data)
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
}
