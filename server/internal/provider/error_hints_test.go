package provider

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestConfiguredErrorMessageIsUsedWithoutLeakingRelayKey(t *testing.T) {
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(402)
		_, _ = w.Write([]byte(`{"error":{"message":"insufficient balance secret-test"}}`))
	})
	ctx := context.Background()
	row, _ := p.Store.Get(ctx, "models", j.Input.Model)
	var m core.Model
	_ = json.Unmarshal(row.Data, &m)
	m.Settings.ErrorHints = []core.ErrorHint{{Contains: "BALANCE", Message: "请联系管理员补充额度"}}
	row.Data = core.Data(m)
	_, _ = p.Store.Put(ctx, "models", row, row.Version)
	_, err := p.Generate(ctx, j)
	if err == nil || err.Error() != "请联系管理员补充额度" {
		t.Fatal(err)
	}
	execution, _ := p.Store.Get(ctx, "executions", j.ID)
	if strings.Contains(string(execution.Data), "secret-test") {
		t.Fatal("relay key leaked into execution record")
	}
}
