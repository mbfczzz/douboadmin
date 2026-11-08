package virtualpay

import "testing"

func TestPaymentMetadataBindsOnlyTheSignedOrder(t *testing.T) {
	for _, raw := range []string{"order-123", `{"attach":"order-123"}`, " { \"attach\" : \"order-123\" } "} {
		if !paymentMetaMatches(raw, "order-123") {
			t.Fatal("matching payment metadata rejected", raw)
		}
	}
	for _, raw := range []string{"", "other", "{}", "null", `"order-123"`, `[]`, `{"attach":123}`, `{"attach":"other"}`,
		`{"attach":"order-123","attach":"other"}`, `{"attach":"other","attach":"order-123"}`,
		`{"attach":"order-123","extra":true}`, `{"attach":"order-123"} {}`, `{"Attach":"order-123"}`} {
		if paymentMetaMatches(raw, "order-123") {
			t.Fatal("ambiguous or unrelated metadata accepted", raw)
		}
	}
	if paymentMetaMatches("", "") {
		t.Fatal("empty order identity accepted")
	}
}
