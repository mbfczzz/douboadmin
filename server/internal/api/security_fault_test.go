package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"testing"
)

type failedNamespace struct {
	store.Store
	namespace string
}

func (s failedNamespace) Get(ctx context.Context, ns, id string) (core.Record, error) {
	if ns == s.namespace {
		return core.Record{}, errors.New("temporary storage failure")
	}
	return s.Store.Get(ctx, ns, id)
}
func approvedShare(t *testing.T) (*Server, string, string) {
	t.Helper()
	a, user, _ := setup(t)
	ctx := context.Background()
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Data: core.Data(map[string]any{"disabled": false})}, 0)
	j := core.NewJob("user-a", "share-fault", core.JobInput{Kind: "image", Prompt: "private", Model: "demo-image"})
	_, _ = a.Store.CreateJob(ctx, j)
	claimed, _ := a.Store.Claim(ctx)
	if e := a.Store.Finish(ctx, claimed, "https://cdn.example/private.png", ""); e != nil {
		t.Fatal(e)
	}
	review, e := a.Store.Get(ctx, "reviews", j.ID)
	if e != nil {
		t.Fatal(e)
	}
	review.Data = core.Data(core.Review{JobID: j.ID, Status: "approved"})
	_, _ = a.Store.Put(ctx, "reviews", review, review.Version)
	w := call(a, "POST", "/api/shares", user, "", map[string]any{"jobId": j.ID})
	var result struct {
		Token string `json:"token"`
	}
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &result) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	return a, j.ID, result.Token
}
func TestPublicSharingFailsClosedWhenAccessChecksCannotBeRead(t *testing.T) {
	for _, ns := range []string{"work_meta", "users", "reviews"} {
		t.Run(ns, func(t *testing.T) {
			a, _, token := approvedShare(t)
			a.Store = failedNamespace{Store: a.Store, namespace: ns}
			if w := call(a, "GET", "/api/shares/"+token, "", "", nil); w.Code != 404 {
				t.Fatalf("access check failure exposed result: %d %s", w.Code, w.Body.String())
			}
		})
	}
}
func TestMalformedUserStatusDoesNotAuthorizeRequests(t *testing.T) {
	a, user, _ := setup(t)
	_, _ = a.Store.Put(context.Background(), "users", core.Record{ID: "user-a", Data: []byte(`{"disabled":"broken"}`)}, 0)
	if w := call(a, "GET", "/api/jobs", user, "", nil); w.Code != 503 {
		t.Fatalf("invalid account status allowed: %d", w.Code)
	}
}
