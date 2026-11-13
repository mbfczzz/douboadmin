package passwordpolicy

import "testing"

func TestPolicy(t *testing.T) {
	for _, value := range []string{"Ab123456", "ABCDEFGa", "abcdefgH", "AaBbCcDd"} {
		if !Valid(value) {
			t.Errorf("valid password rejected: %q", value)
		}
	}
	for _, value := range []string{"", "12345678", "abcdefgh", "ABCDEFGH", "Ab12345", "Ab1234567", "Ab12!456", "Ab12 456", "Ab12_456", "中文Aa1234", "Ａa123456", "Ab12345\n"} {
		if Valid(value) {
			t.Errorf("invalid password accepted: %q", value)
		}
	}
}
func TestGeneratedPasswordsAlwaysSatisfyPolicy(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		p, err := Generate()
		if err != nil || !Valid(p) {
			t.Fatal("generated password violates policy", err)
		}
		seen[p] = true
	}
	if len(seen) < 995 {
		t.Fatal("unexpected repeated generated credentials")
	}
}
