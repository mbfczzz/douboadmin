package virtualpay

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"
)

// answer replaces one WeChat endpoint's reply; other requests go to the fixture.
func answer(f *fixture, path string, reply func() any) *int {
	calls := 0
	orig := f.svc.Client.HTTP
	f.svc.Client.HTTP = doFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == path {
			calls++
			if v := reply(); v != nil {
				return response(200, v), nil
			}
		}
		raw, _ := io.ReadAll(r.Body)
		r.Body = io.NopCloser(bytes.NewReader(raw))
		return orig.Do(r)
	})
	return &calls
}

func (f *fixture) signed(t *testing.T, expiredFor time.Duration) {
	t.Helper()
	row, _ := f.svc.Store.Get(t.Context(), "orders", f.row.ID)
	o := f.order
	o.Virtual.Issued, o.Virtual.PurchaseMode, o.ExpiresAt = true, "package", time.Now().Add(-expiredFor)
	f.put(t, "orders", f.row.ID, o, row.Version)
}

func (f *fixture) status(t *testing.T) string {
	t.Helper()
	_, o, err := f.svc.order(t.Context(), f.row.ID)
	if err != nil {
		t.Fatal(err)
	}
	return o.Status
}

// A signed order WeChat never took payment for (not found, or still unpaid)
// closes after its payment window instead of being queried forever; a payment
// that WeChat confirms later still credits it.
func TestStaleUnpaidOrdersCloseAndALatePaymentStillCredits(t *testing.T) {
	f := newFixture(t)
	f.signed(t, -10*time.Minute) // payment window is still open
	notFound := true
	answer(f, "/xpay/query_order", func() any {
		if notFound {
			return map[string]any{"errcode": orderNotFound, "errmsg": "order_id not exists"}
		}
		return nil
	})
	if err := f.svc.Refresh(t.Context(), f.row.ID); err == nil || f.status(t) != "created" {
		t.Fatal("closed inside the payment window", err)
	}
	f.signed(t, time.Minute)
	if err := f.svc.Refresh(t.Context(), f.row.ID); err != nil || f.status(t) != "closed" {
		t.Fatal("a day-old unpaid order is still open", err)
	}
	// WeChat later reports it paid (e.g. a delayed notice): it is credited once.
	notFound = false
	if err := f.svc.Refresh(t.Context(), f.row.ID); err != nil || f.status(t) != "paid" {
		t.Fatal("late payment on a closed order was not credited", err)
	}
	if err := f.svc.Refresh(t.Context(), f.row.ID); err != nil {
		t.Fatal(err)
	}
	if w, _ := f.svc.Billing.Wallet(t.Context(), "u"); w.Available != 10000 {
		t.Fatal("credit lost or doubled", w)
	}
}

func TestStaleOrderStillUnpaidAtWechatCloses(t *testing.T) {
	f := newFixture(t)
	f.signed(t, 25*time.Hour)
	f.remote.Status = 1 // created, not paid
	if err := f.svc.Refresh(t.Context(), f.row.ID); err != nil || f.status(t) != "closed" {
		t.Fatal(err, f.status(t))
	}
	// A fresh unpaid order is left alone.
	g := newFixture(t)
	g.signed(t, -10*time.Minute) // not expired yet
	g.remote.Status = 1
	if err := g.svc.Refresh(t.Context(), g.row.ID); err != nil || g.status(t) != "created" {
		t.Fatal(err, g.status(t))
	}
}

// An order that was never signed cannot exist at WeChat; once expired it
// closes without any request to WeChat.
func TestExpiredUnsignedOrderClosesWithoutQueryingWechat(t *testing.T) {
	f := newFixture(t)
	row, _ := f.svc.Store.Get(t.Context(), "orders", f.row.ID)
	o := f.order
	o.Virtual.Issued, o.Virtual.PurchaseMode, o.ExpiresAt = false, "package", time.Now().Add(-time.Minute)
	f.put(t, "orders", f.row.ID, o, row.Version)
	queries := answer(f, "/xpay/query_order", func() any { return nil })
	f.svc.Reconcile(t.Context())
	if *queries != 0 || f.status(t) != "closed" {
		t.Fatal(*queries, f.status(t))
	}
}

// An event this service does not act on is acknowledged and kept for review,
// not answered with an error and retried forever.
func TestUnknownEventIsAcknowledgedForReview(t *testing.T) {
	f := newFixture(t)
	ev := Event{Name: "some_other_notice", Fingerprint: "fp-other", Payload: `{"Event":"some_other_notice"}`}
	if err := f.svc.Handle(t.Context(), ev); err != nil {
		t.Fatal("answered WeChat with an error", err)
	}
	row, err := f.svc.Store.Get(t.Context(), "virtual_payment_events", eventID(ev))
	var rec PaymentEvent
	if err != nil || json.Unmarshal(row.Data, &rec) != nil || rec.Status != "needs_review" {
		t.Fatal(err, rec.Status)
	}
}

// Each complaint on an order is its own record: a second complaint after the
// first was reviewed is not dropped.
func TestEachComplaintOnAnOrderIsKept(t *testing.T) {
	f := newFixture(t)
	c1 := Event{Name: "xpay_complaint_notify", RefundOrderID: f.row.ID, ComplaintID: "c1", Fingerprint: "f1", Payload: `{"ComplaintId":"c1"}`}
	c2 := c1
	c2.ComplaintID, c2.Fingerprint, c2.Payload = "c2", "f2", `{"ComplaintId":"c2"}`
	if err := f.svc.Handle(t.Context(), c1); err != nil {
		t.Fatal(err)
	}
	row, _ := f.svc.Store.Get(t.Context(), "virtual_payment_events", eventID(c1))
	if err := f.svc.ReviewEvent(t.Context(), row.ID, row.Version, "已处理 c1", "admin"); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.Handle(t.Context(), c2); err != nil {
		t.Fatal(err)
	}
	second, err := f.svc.Store.Get(t.Context(), "virtual_payment_events", eventID(c2))
	var rec PaymentEvent
	if eventID(c1) == eventID(c2) || err != nil || json.Unmarshal(second.Data, &rec) != nil || rec.Status != "needs_review" {
		t.Fatal("second complaint dropped", err, rec.Status)
	}
}
