package notifications

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"doubo/server/internal/wechat"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func response(body string) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}
}
func senderFixture(t *testing.T, rt transport) *Sender {
	t.Helper()
	s := store.NewMemory()
	ctx := context.Background()
	for ns, row := range map[string]core.Record{
		"subscription_queue": {ID: "notification", Owner: "user", Data: core.Data(core.Notification{Kind: "job", Title: "作品已完成", TargetID: "job"})},
		"preferences":        {ID: "user", Data: core.Data(core.UserPreferences{CompletionSubscription: true})},
		"wechat_identities":  {ID: "user", Data: core.Data(map[string]string{"openid": "test-openid"})},
	} {
		if _, e := s.Put(ctx, ns, row, 0); e != nil {
			t.Fatal(e)
		}
	}
	return &Sender{Store: s, WeChat: &wechat.Client{AppID: "test-app", Secret: "test-secret", HTTP: &http.Client{Transport: rt}}, TemplateID: "template", Fields: map[string]string{"thing1": "{{title}}"}}
}
func TestTokenFailureDoesNotConsumeDelivery(t *testing.T) {
	var tokenCalls, sendCalls atomic.Int32
	s := senderFixture(t, func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "stable_token") {
			if tokenCalls.Add(1) == 1 {
				return nil, errors.New("offline")
			}
			return response(`{"access_token":"token","expires_in":7200}`), nil
		}
		sendCalls.Add(1)
		return response(`{"errcode":0}`), nil
	})
	ctx := context.Background()
	s.deliver(ctx)
	if _, e := s.Store.Get(ctx, "subscription_delivery", "notification"); !errors.Is(e, core.ErrNotFound) {
		t.Fatal(e)
	}
	s.deliver(ctx)
	if sendCalls.Load() != 1 {
		t.Fatal(sendCalls.Load())
	}
}
func TestConcurrentSendersDeliverOnlyOnce(t *testing.T) {
	var sends atomic.Int32
	s := senderFixture(t, func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "stable_token") {
			return response(`{"access_token":"token","expires_in":7200}`), nil
		}
		sends.Add(1)
		return response(`{"errcode":0}`), nil
	})
	var wg sync.WaitGroup
	for range 12 {
		replica := &Sender{Store: s.Store, WeChat: s.WeChat, TemplateID: s.TemplateID, Fields: s.Fields}
		wg.Go(func() { replica.deliver(context.Background()) })
	}
	wg.Wait()
	if sends.Load() != 1 {
		t.Fatal(sends.Load())
	}
}
func TestInvalidSendResponseIsNotMarkedSentOrRetried(t *testing.T) {
	var sends int
	s := senderFixture(t, func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "stable_token") {
			return response(`{"access_token":"token","expires_in":7200}`), nil
		}
		sends++
		return response(`{}`), nil
	})
	ctx := context.Background()
	s.deliver(ctx)
	s.deliver(ctx)
	row, e := s.Store.Get(ctx, "subscription_delivery", "notification")
	if e != nil {
		t.Fatal(e)
	}
	var v map[string]string
	if json.Unmarshal(row.Data, &v) != nil || v["status"] != "not_confirmed" || sends != 1 {
		t.Fatal(string(row.Data), sends)
	}
}
