package llm

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Provider errors reach users in Chinese, never as the provider's English.
func TestProviderErrorsAreExplainedInChinese(t *testing.T) {
	cases := map[string]string{
		`{"error":{"code":"ModelNotOpen","message":"Your account 2100582414 has not activated the model doubao-seed-2-1-lite-260915. Please activate the model service in the Ark Console."}}`: "还没有在服务商处开通",
		`{"error":{"code":"InvalidEndpointOrModel.NotFound","message":"The model or endpoint does not exist"}}`:                                                                                "模型不存在",
		`{"error":{"code":"InputTextSensitiveContentDetected","message":"The request failed because the input text may contain sensitive information."}}`:                                      "安全审核",
		`{"error":{"message":"something odd"}}`: "暂时无法处理",
	}
	for body, want := range cases {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(404); _, _ = w.Write([]byte(body)) }))
		_, _, err := (&Client{BaseURL: srv.URL, Key: "k"}).Complete(t.Context(), "m", nil, 0, nil)
		srv.Close()
		if err == nil || !strings.Contains(err.Error(), want) || strings.ContainsAny(err.Error(), "abcdefghijklmnopqrstuvwxyz") {
			t.Fatalf("%s -> %v", want, err)
		}
	}
}

// 豆包 Seed answers without deep thinking (much faster); others are untouched.
func TestSeedModelsAnswerWithoutThinking(t *testing.T) {
	var got []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b map[string]any
		_ = json.NewDecoder(r.Body).Decode(&b)
		got = append(got, b)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"好"}}]}`))
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL, Key: "k"}
	for _, m := range []string{"doubao-seed-2-1-lite-260915", "ep-20261120-abc", "deepseek-chat"} {
		if _, _, err := c.Complete(t.Context(), m, nil, 0, nil); err != nil {
			t.Fatal(err)
		}
	}
	if th, ok := got[0]["thinking"].(map[string]any); !ok || th["type"] != "disabled" {
		t.Fatal("seed model still thinks", got[0])
	}
	if _, ok := got[1]["thinking"]; ok {
		t.Fatal("endpoint ids keep their own setting")
	}
	if _, ok := got[2]["thinking"]; ok {
		t.Fatal("deepseek untouched")
	}
}
