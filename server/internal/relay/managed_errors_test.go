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
	// The upstream refusing a material, still labelled 5006, ends the task
	// with the reason the user can act on.
	for message, want := range map[string]int{
		"upstream_error: Reference video 1 lasts 30.167 seconds; each reference video must last between 2 and 30 seconds; 备用渠道不可用：provider unavailable: HTTP 401": 5101,
		"upstream_error: reference audio duration must be at most 15 seconds":                                                                                     5101,
		"upstream_error: reference video format is not supported":                                                                                                 5102,
		"upstream_error: failed to decode input video":                                                                                                            5103,
		"upstream_error: reference image aspect ratio out of range":                                                                                               5104,
		"upstream_error: InvalidParameter: duration":                                                                                                              5003,
	} {
		got := ParseManagedError([]byte(`{"error":{"code":5006,"type":"provider_unavailable","message":` + strconv.Quote(message) + `}}`))
		if got.Code != want || got.Retryable {
			t.Fatalf("%q: %+v", message, got)
		}
	}
	// A plain 5001 that names the cause is that cause.
	for message, want := range map[string]int{
		"video_generation_failed: 本次生成失败：第1个视频素材：素材时长 30.067 秒，要求大于 0 且不超过 30 秒。已释放原预留款项。": 5101,
		"video_generation_failed: 第2个图片素材格式不受支持":                                           5102,
		"video_generation_failed: the output did not pass the content safety review":       5002,
		"video_generation_failed: upstream internal error":                                 5001,
	} {
		if got := ParseManagedError([]byte(`{"error":{"code":5001,"type":"task_failed","message":` + strconv.Quote(message) + `}}`)); got.Code != want {
			t.Fatalf("5001 %q: %+v", message, got)
		}
	}
	for _, outage := range []string{"provider unavailable: HTTP 401 MEDIA_TOKEN_DENIED", "upstream timeout after 60s", "rate limited, try later",
		"upstream video request took too long", "video generation duration exceeded the queue window"} {
		if got := ParseManagedError([]byte(`{"error":{"code":5006,"message":` + strconv.Quote(outage) + `}}`)); got.Code != 5006 {
			t.Fatalf("an outage stays retryable: %q %+v", outage, got)
		}
	}
}
