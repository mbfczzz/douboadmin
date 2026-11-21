package relay

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestManagedErrorCatalogIsCompleteAndStable(t *testing.T) {
	codes := []int{4001, 4003, 4004, 4009, 4013, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010, 5011, 5012, 5013, 5101, 5102, 5103, 5104, 5201, 5202}
	if len(managedRules) != len(codes) {
		t.Fatalf("catalog has %d entries", len(managedRules))
	}
	for _, code := range codes {
		rule, ok := managedRules[code]
		if !ok || rule.typ == "" || rule.message == "" || rule.action == "" {
			t.Fatalf("incomplete code %d", code)
		}
		raw := []byte("{\"error\":{\"code\":" + strconv.Itoa(code) + ",\"type\":\"" + rule.typ + "\",\"user_message\":\"自定义可展示提示\"}}")
		got := ParseManagedError(raw)
		if got.Code != code || got.Type != rule.typ || got.UserMessage != "自定义可展示提示" || got.Action != rule.action || got.Retryable != rule.retryable || got.Editable != managedEditable[code] || got.Definitive != rule.definitive {
			t.Fatalf("code %d: %+v", code, got)
		}
	}
}

func TestManagedErrorRejectsUnknownOrMismatchedPublicText(t *testing.T) {
	unknown := ParseManagedError([]byte("{\"error\":{\"code\":9999,\"type\":\"other\",\"user_message\":\"不可信提示\",\"message\":\"operator\"}}"))
	if unknown.Type != "" || unknown.UserMessage != "" || unknown.Action != "" || unknown.Message != "operator" {
		t.Fatal(unknown)
	}
	mismatch := ParseManagedError([]byte("{\"code\":\"5002\",\"type\":\"wrong\",\"user_message\":\"伪造提示\",\"upstream_code\":123,\"upstream_type\":\"vendor\"}"))
	if mismatch.UserMessage != managedRules[5002].message || mismatch.UpstreamCode != "123" || mismatch.UpstreamType != "vendor" {
		t.Fatal(mismatch)
	}
}

func TestHTTPErrorCarriesManagedFieldsWithoutLeakingKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte("{\"error\":{\"code\":5002,\"type\":\"safety_policy\",\"message\":\"blocked private-key\",\"user_message\":\"请修改内容\",\"upstream_code\":\"safe\",\"upstream_type\":\"policy\"}}"))
	}))
	defer server.Close()
	client := New(server.URL, "private-key")
	_, err := client.Do(context.Background(), "POST", "/v1/images/generations", map[string]string{"prompt": "x"})
	var httpErr *HTTPError
	if !errors.As(err, &httpErr) || httpErr.Managed.Code != 5002 || httpErr.Managed.UserMessage != "请修改内容" {
		t.Fatal(err)
	}
	if strings.Contains(err.Error(), "private-key") || !strings.Contains(err.Error(), "业务码 5002") {
		t.Fatal(err)
	}
}

// A finished task's content review failure, labelled 5006 by the relay, is
// read as the safety failure it is (and so ends the task), not as a model
// that is only down for a moment.
func TestManagedErrorSettlesAFinishedFailureLabelledUnavailable(t *testing.T) {
	safety := ParseManagedError([]byte(`{"error":{"code":5006,"type":"provider_unavailable","message":"generation_failed: The generated audio did not pass the content safety review."}}`))
	if safety.Code != 5002 || safety.Type != "safety_policy" || safety.Retryable || !safety.Editable {
		t.Fatalf("%+v", safety)
	}
	failed := ParseManagedError([]byte(`{"error":{"code":5006,"message":"generation_failed: upstream error"}}`))
	if failed.Code != 5001 || failed.Type != "task_failed" {
		t.Fatalf("%+v", failed)
	}
	down := ParseManagedError([]byte(`{"error":{"code":5006,"message":"no channel available"}}`))
	if down.Code != 5006 || !down.Retryable {
		t.Fatalf("a real outage stays retryable: %+v", down)
	}
	if got := ParseManagedError([]byte(`{"error":{"code":5003,"message":"generation_failed: bad size"}}`)); got.Code != 5003 {
		t.Fatalf("a specific code is kept: %+v", got)
	}
}
