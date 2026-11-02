package core

import "testing"

func TestUnavailableSelectedCapabilityDoesNotTurnIntoUnrestrictedModel(t *testing.T) {
	m := Model{Kind: "image", Published: true, Available: true, Resolutions: []string{"1k"}, Settings: ModelSettings{Resolutions: []string{"removed-4k"}}}
	if m.Effective().Usable() {
		t.Fatal("removed upstream capability became unrestricted")
	}
	if err := m.Settings.Validate(m); err == nil {
		t.Fatal("invented capability accepted")
	}
}

func TestModelSettingsRejectInvalidValues(t *testing.T) {
	m := Model{Ratios: []string{"1:1"}}
	for _, s := range []ModelSettings{{Ratios: []string{"unsupported"}}, {CostUSD: "NaN"}, {Icon: "javascript:alert(1)"}, {MaxRefImages: 21}, {RefLimits: map[string]float64{"bad": 2}}, {ErrorHints: []ErrorHint{{Contains: "", Message: "missing"}}}, {AvailabilityStatus: "fake"}} {
		if s.Validate(m) == nil {
			t.Fatalf("invalid configuration accepted: %#v", s)
		}
	}
}

func TestErrorHintsUseCaseInsensitiveFirstMatch(t *testing.T) {
	s := ModelSettings{ErrorHints: []ErrorHint{{Contains: "BALANCE", Message: "请联系管理员"}, {Contains: "balance", Message: "second"}}}
	if s.ErrorMessage("insufficient balance", "default") != "请联系管理员" {
		t.Fatal("mapping failed")
	}
	if s.ErrorMessage("other", "default") != "default" {
		t.Fatal("fallback lost")
	}
}
