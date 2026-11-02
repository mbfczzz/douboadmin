package api

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

func TestLogoutWorksWhenUserQuotaIsExhausted(t *testing.T) {
	a, token, _ := setup(t)
	for range 181 {
		_, _ = a.Sessions.Allow(context.Background(), "user-a", 180)
	}
	if call(a, "GET", "/api/jobs", token, "", nil).Code != 429 {
		t.Fatal("test did not exhaust quota")
	}
	if w := call(a, "POST", "/api/auth/logout", token, "", nil); w.Code != 200 {
		t.Fatal("rate limit blocked logout", w.Code)
	}
	if call(a, "GET", "/api/jobs", token, "", nil).Code != 401 {
		t.Fatal("session not revoked")
	}
}
func avatarRequest(a *Server, token string, data []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", "avatar.jpg")
	_, _ = part.Write(data)
	_ = writer.Close()
	r := httptest.NewRequest("POST", "/api/assets?purpose=avatar", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}
func TestAvatarUploadLimitsBeforeObjectStorage(t *testing.T) {
	a, token, _ := setup(t)
	objects := &countingObjects{}
	a.Objects = objects
	data := make([]byte, 5*1024*1024+1)
	copy(data, []byte{0xff, 0xd8, 0xff, 0xe0})
	if w := avatarRequest(a, token, data); w.Code != 400 {
		t.Fatal("oversize avatar accepted", w.Code)
	}
	if w := avatarRequest(a, token, []byte("not an image")); w.Code != 400 {
		t.Fatal("non-image accepted", w.Code)
	}
	if objects.writes != 0 {
		t.Fatal("rejected upload reached OSS")
	}
	rows, _ := a.Store.List(context.Background(), "assets", "")
	if len(rows) != 0 {
		t.Fatal("invalid assets persisted")
	}
}

type countingObjects struct{ writes int }

func (o *countingObjects) Put(context.Context, string, io.Reader, string) error {
	o.writes++
	return nil
}
func (o *countingObjects) URL(context.Context, string) (string, error) {
	return "https://example.invalid/signed", nil
}

type assetFailureStore struct{ store.Store }

func (s assetFailureStore) Get(ctx context.Context, ns, id string) (core.Record, error) {
	if ns == "assets" {
		return core.Record{}, errors.New("database unavailable")
	}
	return s.Store.Get(ctx, ns, id)
}
func TestAvatarDependencyFailureIsRetryable(t *testing.T) {
	a, token, _ := setup(t)
	_, _ = a.Store.Put(context.Background(), "users", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(map[string]string{"nickname": "before"})}, 0)
	a.Store = assetFailureStore{a.Store}
	w := call(a, "PUT", "/api/me", token, "", map[string]any{"version": 1, "nickname": "after", "bio": "", "avatarId": "existing"})
	if w.Code != 503 {
		t.Fatal("dependency outage misreported as invalid avatar", w.Code)
	}
}

// Missing and foreign assets are client errors; a failing dependency is not.
func TestAvatarMissingDoesNotChangeProfile(t *testing.T) {
	a, token, _ := setup(t)
	_, _ = a.Store.Put(context.Background(), "users", core.Record{ID: "user-a", Owner: "user-a", Data: core.Data(map[string]string{"nickname": "before"})}, 0)
	w := call(a, "PUT", "/api/me", token, "", map[string]any{"version": 1, "nickname": "after", "bio": "", "avatarId": "missing"})
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
	r, _ := a.Store.Get(context.Background(), "users", "user-a")
	if r.Version != 1 {
		t.Fatal("invalid update changed profile")
	}
}
