package vision

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeArk serves the Files API and chat/completions the way 方舟 documents
// them; status "failed" makes processing fail.
type fakeArk struct {
	mu       sync.Mutex
	status   string
	uploaded int64
	fields   map[string]string
	polls    int
	video    map[string]any
	deleted  []string
}

func (f *fakeArk) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case r.Method == "POST" && r.URL.Path == "/api/v3/files":
		mr, _ := r.MultipartReader()
		f.fields = map[string]string{}
		for part, err := mr.NextPart(); err == nil; part, err = mr.NextPart() {
			if part.FormName() == "file" {
				f.uploaded, _ = io.Copy(io.Discard, part)
				continue
			}
			value, _ := io.ReadAll(part)
			f.fields[part.FormName()] = string(value)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "file-1", "status": "processing"})
	case r.Method == "GET" && r.URL.Path == "/api/v3/files/file-1":
		f.polls++
		status := "processing"
		if f.polls > 1 {
			status = f.status
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "file-1", "status": status, "error": map[string]any{"message": "codec not supported"}})
	case r.Method == "POST" && r.URL.Path == "/api/v3/chat/completions":
		var body struct {
			Messages []struct {
				Content []map[string]any `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.video, _ = body.Messages[0].Content[0]["video_url"].(map[string]any)
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": `{"hook":"开场","shots":[{"start":0,"end":3,"action":"开箱"}]}`}}}})
	case r.Method == "DELETE" && r.URL.Path == "/api/v3/files/file-1":
		f.deleted = append(f.deleted, "file-1")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "file-1", "deleted": true})
	default:
		w.WriteHeader(404)
	}
}

// A video over 50 MB is uploaded, watched by file_id once processed, and deleted.
func TestLargeVideoGoesThroughTheFilesAPI(t *testing.T) {
	filePoll = 5 * time.Millisecond
	ark := &fakeArk{status: "active"}
	server := httptest.NewServer(ark)
	defer server.Close()
	size := int64(URLLimit + 1)
	opened := 0
	video := Video{URL: "https://oss.example/big.mp4", Size: size, Open: func(context.Context) (io.ReadCloser, error) {
		opened++
		return io.NopCloser(io.LimitReader(zeros{}, size)), nil
	}}
	c := &Client{BaseURL: server.URL + "/api/v3", Key: "k", Model: "doubao-seed-2-1-lite-260915"}
	b, err := c.Breakdown(context.Background(), video)
	if err != nil || b.Hook != "开场" {
		t.Fatal(b, err)
	}
	if opened != 1 || ark.uploaded != size || ark.fields["purpose"] != "user_data" || ark.fields["preprocess_configs[video][model]"] != c.Model || ark.fields["preprocess_configs[video][fps]"] != "1" || ark.fields["expire_at"] == "" {
		t.Fatal("upload", opened, ark.uploaded, ark.fields)
	}
	if ark.video["file_id"] != "file-1" || ark.video["url"] != nil || ark.polls < 2 || len(ark.deleted) != 1 {
		t.Fatal("watched by file id after processing, then deleted", ark.video, ark.polls, ark.deleted)
	}

	failed := &fakeArk{status: "failed"}
	broken := httptest.NewServer(failed)
	defer broken.Close()
	c.BaseURL = broken.URL + "/api/v3"
	if _, err := c.Breakdown(context.Background(), video); err == nil || !strings.Contains(err.Error(), "codec not supported") || failed.video != nil || len(failed.deleted) != 1 {
		t.Fatal("failed processing", err, failed.video, failed.deleted)
	}
	if _, err := c.Breakdown(context.Background(), Video{Size: FileLimit + 1}); err == nil {
		t.Fatal("over 512 MB accepted")
	}
}

// Link fetches the stored video from its own link for the upload.
func TestLinkOpensTheStoredVideo(t *testing.T) {
	oss := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("mp4 bytes")) }))
	defer oss.Close()
	body, err := Link(oss.URL+"/v.mp4", 9).Open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer body.Close()
	if data, _ := io.ReadAll(body); !bytes.Equal(data, []byte("mp4 bytes")) {
		t.Fatal(string(data))
	}
}

type zeros struct{}

func (zeros) Read(p []byte) (int, error) { clear(p); return len(p), nil }
