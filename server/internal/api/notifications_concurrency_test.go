package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"testing"
)

type notificationConflictStore struct{ store.Store }

func (s notificationConflictStore) Put(ctx context.Context, ns string, row core.Record, version int64) (core.Record, error) {
	if ns == "notifications" {
		return core.Record{}, core.ErrConflict
	}
	return s.Store.Put(ctx, ns, row, version)
}

func TestReadAllDoesNotReportSuccessWhenAnUnreadRowConflicts(t *testing.T) {
	a, user, _ := setup(t)
	if _, e := a.Store.Put(t.Context(), "notifications", core.Record{ID: "changed-notice", Owner: "user-a", Data: core.Data(core.Notification{Title: "changed", Read: false})}, 0); e != nil {
		t.Fatal(e)
	}
	a.Store = notificationConflictStore{a.Store}
	w := call(a, "POST", "/api/notifications/read-all", user, "", nil)
	if w.Code != 409 {
		t.Fatal("unread conflict reported as success", w.Code, w.Body.String())
	}
}
