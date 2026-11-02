package store

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"testing"
)

func TestSubscriptionDoesNotDependOnInAppPreference(t *testing.T) {
	for _, inApp := range []bool{false, true} {
		s := NewMemory()
		ctx := context.Background()
		_, _ = s.Put(ctx, "preferences", core.Record{ID: "user", Data: core.Data(core.UserPreferences{InAppNotifications: inApp, CompletionSubscription: true})}, 0)
		j := core.NewJob("user", "key", core.JobInput{Kind: "image"})
		_, _ = s.CreateJob(ctx, j)
		claimed, _ := s.Claim(ctx)
		if e := s.Finish(ctx, claimed, "asset:result", ""); e != nil {
			t.Fatal(e)
		}
		queue, e := s.PendingSubscriptions(ctx, "", 20)
		if e != nil || len(queue) != 1 {
			t.Fatal(queue, e)
		}
		notices, _ := s.List(ctx, "notifications", "user")
		if (len(notices) > 0) != inApp {
			t.Fatalf("station preference ignored: %d", len(notices))
		}
	}
}
func checkSubscriptionQueue(t *testing.T, s Store, owner string) {
	t.Helper()
	ctx := context.Background()
	for _, suffix := range []string{"a", "b", "c"} {
		_, e := s.Put(ctx, "subscription_queue", core.Record{ID: owner + suffix, Owner: owner, Data: core.Data(core.Notification{Kind: "job"})}, 0)
		if e != nil {
			t.Fatal(e)
		}
	}
	_, e := s.Put(ctx, "subscription_delivery", core.Record{ID: owner + "a", Owner: owner, Data: json.RawMessage(`{"status":"not_confirmed"}`)}, 0)
	if e != nil {
		t.Fatal(e)
	}
	rows, e := s.PendingSubscriptions(ctx, owner, 1)
	if e != nil || len(rows) != 1 || rows[0].ID != owner+"b" {
		t.Fatal(rows, e)
	}
	rows, e = s.PendingSubscriptions(ctx, rows[0].ID, 1)
	if e != nil || len(rows) != 1 || rows[0].ID != owner+"c" {
		t.Fatal(rows, e)
	}
}
func TestPendingSubscriptionsSkipAttemptedAndPage(t *testing.T) {
	checkSubscriptionQueue(t, NewMemory(), "queue-")
}
func TestMySQLPendingSubscriptionsSkipAttemptedAndPage(t *testing.T) {
	s := mysqlFixture(t)
	owner := "queue-" + core.NewID()
	t.Cleanup(func() { _, _ = s.db.Exec(`DELETE FROM records WHERE owner_id=?`, owner) })
	checkSubscriptionQueue(t, s, owner)
}
