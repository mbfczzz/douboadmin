package core

import (
	"errors"
	"strings"
	"testing"
)

func referenceModel() Model {
	return Model{Kind: "video", Durations: []int{5, 10}, Resolutions: []string{"720p"}, Modes: []string{"omni_ref"}, ReferenceTypes: []string{"video"},
		Settings: ModelSettings{ReferenceVideoBilling: true, PriceMatrix: map[string]map[string]float64{"5s": {"720p": 35}, "10s": {"720p": 60.5}}}}
}

// Each reference video costs the shortest configured duration covering it.
func TestReferenceVideoUnitsRoundUpToADurationTier(t *testing.T) {
	m, in := referenceModel(), JobInput{Kind: "video", Resolution: "720p"}
	for _, c := range []struct {
		seconds []float64
		want    int64
	}{{nil, 0}, {[]float64{3}, 3500}, {[]float64{5}, 3500}, {[]float64{5.08}, 3500}, {[]float64{5.2}, 6050}, {[]float64{7, 2}, 9550}} {
		if got, err := ReferenceVideoUnits(m, in, c.seconds); err != nil || got != c.want {
			t.Fatal(c.seconds, got, err)
		}
	}
	var tooLong ReferenceVideoError
	if _, err := ReferenceVideoUnits(m, in, []float64{12}); !errors.As(err, &tooLong) || !strings.Contains(err.Error(), "10 秒") {
		t.Fatal("over the longest duration", err)
	}
	off := m
	off.Settings.ReferenceVideoBilling = false
	if got, _ := ReferenceVideoUnits(off, in, []float64{7}); got != 0 {
		t.Fatal("charged with the switch off", got)
	}
	if got, _ := ReferenceVideoUnits(m, JobInput{Kind: "image"}, []float64{7}); got != 0 {
		t.Fatal("charged an image", got)
	}
	half := m
	halfPercent := 50.0
	half.Settings.ReferenceVideoPricePercent = &halfPercent
	if got, err := ReferenceVideoUnits(half, in, []float64{7, 2}); err != nil || got != 4775 {
		t.Fatal("50% reference discount", got, err)
	}
	for percent, want := range map[float64]int64{1: 96, 100: 9550} {
		priced := m
		priced.Settings.ReferenceVideoPricePercent = &percent
		if got, err := ReferenceVideoUnits(priced, in, []float64{7, 2}); err != nil || got != want {
			t.Fatal("reference percentage", percent, got, err)
		}
	}
}

// Turning it on needs video references and a price in every cell.
func TestReferenceVideoBillingValidation(t *testing.T) {
	m := referenceModel()
	if err := m.Settings.Validate(m); err != nil {
		t.Fatal(err)
	}
	missing := m.Settings
	missing.PriceMatrix = map[string]map[string]float64{"5s": {"720p": 35}}
	if err := missing.Validate(m); err == nil || !strings.Contains(err.Error(), "10s") {
		t.Fatal("missing cell accepted", err)
	}
	noVideo := m.Settings
	noVideo.OmniReferences = map[string]bool{"video": false}
	if err := noVideo.Validate(m); err == nil {
		t.Fatal("billing without video references accepted")
	}
	hidden := m.Settings
	hidden.HideResolution = true
	if err := hidden.Validate(m); err == nil {
		t.Fatal("billing with a hidden resolution accepted")
	}
	image := Model{Kind: "image"}
	if err := (ModelSettings{ReferenceVideoBilling: true}).Validate(image); err == nil {
		t.Fatal("image model accepted")
	}
	for _, percent := range []float64{0, 101, -1} {
		badPercent := m.Settings
		badPercent.ReferenceVideoPricePercent = &percent
		if err := badPercent.Validate(m); err == nil || !strings.Contains(err.Error(), "1%–100%") {
			t.Fatal("invalid reference percentage accepted", percent, err)
		}
	}
}
