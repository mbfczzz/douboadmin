package audit

import (
	"strings"
	"testing"
)

func TestPhoneLoginGrantIsRedacted(t *testing.T) {
	for _, sanitize := range []func([]byte, bool) string{Request, Body} {
		logged := sanitize([]byte(`{"phoneCode":"one-use-phone-grant","token":"private-token"}`), false)
		if strings.Contains(logged, "one-use-phone-grant") || strings.Contains(logged, "private-token") {
			t.Fatal("authorization grant leaked")
		}
		if !strings.Contains(logged, `"phoneCode":"***"`) {
			t.Fatal(logged)
		}
	}
}
