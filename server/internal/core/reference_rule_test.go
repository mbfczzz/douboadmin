package core

import "testing"

// A reference video may be as long as the operator sets, else the family's
// official limit (Seedance 2.5: 30 s), else 15 s.
func TestRefVideoSeconds(t *testing.T) {
	for _, tc := range []struct {
		m    Model
		want int
	}{
		{Model{Name: "Sd 2.5 特价1"}, 30},
		{Model{Name: "Seedance 2.5", Key: "seedance-2.5"}, 30},
		{Model{Name: "Seedance 2.0"}, 15},
		{Model{Name: "Kling 2.5"}, 15},
		{Model{Name: "Sd 2.5", Settings: ModelSettings{RefLimits: map[string]float64{"omniRef.videoSeconds": 10}}}, 10},
	} {
		if got := RefVideoSeconds(tc.m); got != tc.want {
			t.Fatal(tc.m.Name, got)
		}
	}
	m := Model{Kind: "video", ReferenceTypes: []string{"video"}}
	for n, ok := range map[float64]bool{1: true, 30: true, 60: true, 61: false, 2.5: false} {
		s := ModelSettings{RefLimits: map[string]float64{"omniRef.videoSeconds": n}}
		if err := s.Validate(m); (err == nil) != ok {
			t.Fatal(n, err)
		}
	}
}
