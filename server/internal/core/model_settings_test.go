package core

import "testing"

func TestConfiguredParametersMayExtendUpstreamButModesKeepProtocolGuards(t *testing.T) {
	m := Model{Kind: "image", Published: true, Available: true, Modes: []string{"t2i"}, Resolutions: []string{"1k"}, Settings: ModelSettings{Resolutions: []string{"4k"}}}
	if !m.Effective().Usable() || m.Effective().Resolutions[0] != "4k" {
		t.Fatal("explicit parameter override was discarded")
	}
	if err := m.Settings.Validate(m); err != nil {
		t.Fatal("valid parameter override rejected", err)
	}
	m.Settings.Modes = []string{"unsupported-mode"}
	if m.Effective().Usable() || m.Settings.Validate(m) == nil {
		t.Fatal("protocol mode guard lost")
	}
}

func TestModelSettingsRejectInvalidValues(t *testing.T) {
	m := Model{Ratios: []string{"1:1"}}
	for _, s := range []ModelSettings{{Ratios: []string{""}}, {Resolutions: []string{"4k", "4k"}}, {Durations: []int{0}}, {Durations: []int{601}}, {CostUSD: "NaN"}, {Icon: "javascript:alert(1)"}, {MaxRefImages: 21}, {RefLimits: map[string]float64{"bad": 2}}, {ErrorHints: []ErrorHint{{Contains: "", Message: "missing"}}}, {AvailabilityStatus: "fake"}} {
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

// Per-token prices only for directly called chat models (they report usage).
func TestTokenPricingOnlyForDirectChatModels(t *testing.T) {
	s := ModelSettings{TokenInputPrice: 0.01, TokenOutputPrice: 0.04}
	if err := s.Validate(Model{Kind: "chat", Key: "deepseek:deepseek-flash"}); err != nil {
		t.Fatal(err)
	}
	if err := s.Validate(Model{Kind: "chat", Key: "gpt-4o-mini"}); err == nil {
		t.Fatal("a relay chat model accepted token prices")
	}
}
