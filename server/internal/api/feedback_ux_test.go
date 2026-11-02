package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestFeedbackRejectsBlankAndTrimsContent(t *testing.T) {
	app, token, _ := setup(t)
	for _, content := range []string{"   ", "\n\t", "  好  "} {
		response := call(app, "POST", "/api/feedback", token, "", map[string]string{"content": content})
		if response.Code != 400 {
			t.Fatalf("blank/short feedback accepted: %d", response.Code)
		}
	}
	response := call(app, "POST", "/api/feedback", token, "", map[string]string{"content": "  上传功能建议\n"})
	if response.Code != 201 {
		t.Fatal(response.Code)
	}
	var row core.Record
	if err := json.Unmarshal(response.Body.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	var data struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(row.Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.Content != "上传功能建议" {
		t.Fatal("feedback was not trimmed")
	}
}
