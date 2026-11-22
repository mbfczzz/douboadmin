package api

import (
	"errors"
	"testing"

	"doubo/server/internal/relay"
)

func TestModelCallErrorKeepsOnlyRelayReason(t *testing.T) {
	err := &relay.HTTPError{
		Status:  401,
		Message: "封装层 API Key 无效或已停用",
		Managed: relay.ManagedError{Code: 4001, Type: "invalid_api_key"},
	}
	if got := modelCallError(err); got != err.Message {
		t.Fatalf("model log error = %q, want %q", got, err.Message)
	}
	plain := errors.New("中转服务连接中断")
	if got := modelCallError(plain); got != plain.Error() {
		t.Fatalf("plain model log error = %q", got)
	}
}
