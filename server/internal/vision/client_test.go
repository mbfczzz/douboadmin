package vision

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBreakdownRequestAndParse(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/chat/completions" || r.Header.Get("Authorization") != "Bearer k" {
			t.Errorf("request %s %s", r.URL.Path, r.Header.Get("Authorization"))
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		answer := "```json\n{\"summary\":\"开箱口红\",\"hook\":\"撕快递\",\"sellingPoints\":[\"显白\"],\"shots\":[{\"start\":0,\"end\":2.5,\"scene\":\"卧室书桌\",\"action\":\"撕开快递\",\"camera\":\"手持中景\",\"speech\":\"\"},{\"start\":2.5,\"end\":5,\"scene\":\"\",\"action\":\"\",\"camera\":\"\",\"speech\":\"\"}]}\n```"
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": answer}}}})
	}))
	defer server.Close()
	c := &Client{BaseURL: server.URL + "/api/v3", Key: "k", Model: "doubao-seed-1-6-vision-250815"}
	b, err := c.Breakdown(context.Background(), "https://oss.example/v.mp4?sig=1")
	if err != nil || b.Hook != "撕快递" || len(b.Shots) != 1 || b.Shots[0].End != 2.5 || b.SellingPoints[0] != "显白" {
		t.Fatalf("%+v %v", b, err)
	}
	content := got["messages"].([]any)[0].(map[string]any)["content"].([]any)
	video := content[0].(map[string]any)
	if got["model"] != "doubao-seed-1-6-vision-250815" || video["type"] != "video_url" || video["video_url"].(map[string]any)["url"] != "https://oss.example/v.mp4?sig=1" {
		t.Fatalf("request body %v", got)
	}
}

func TestBreakdownErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_, _ = w.Write([]byte(`{"error":{"message":"The API key is invalid"}}`))
	}))
	defer server.Close()
	_, err := (&Client{BaseURL: server.URL, Key: "k", Model: "m"}).Breakdown(context.Background(), "https://x/v.mp4")
	if err == nil || err.Error() != "视频理解 API Key 无效：The API key is invalid" {
		t.Fatal(err)
	}
	if _, err := Parse("没有 JSON"); err == nil {
		t.Fatal("garbage accepted")
	}
	if _, err := Parse(`{"shots":[]}`); err == nil {
		t.Fatal("no shots accepted")
	}
}
