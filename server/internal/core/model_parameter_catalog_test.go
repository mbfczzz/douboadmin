package core

import (
	"reflect"
	"testing"
)

func TestFixedParameterCatalogAllowsRequestedOptionsAndFiltersLegacyValues(t *testing.T) {
	video := Model{Kind: "video", Published: true, Available: true, Resolutions: []string{"720p", "768P", "8k"}, Ratios: []string{"16:9", "9:21"}, Durations: []int{30, 15, 1, 1, 0, 31, 60}}
	s := ModelSettings{Resolutions: []string{"480p", "720p", "768p", "1080p", "2k", "4k"}, Ratios: ratioOptions}
	for n := 1; n <= 30; n++ {
		s.Durations = append(s.Durations, n)
	}
	if err := s.Validate(video); err != nil {
		t.Fatal(err)
	}
	view := video.Effective()
	if !reflect.DeepEqual(view.Resolutions, []string{"720p", "768P"}) || !reflect.DeepEqual(view.Durations, []int{1, 15, 30}) || !reflect.DeepEqual(view.Ratios, []string{"16:9"}) {
		t.Fatal(view)
	}
	image := Model{Kind: "image", Resolutions: []string{"auto", "1K", "2k", "4k", "8k"}, Qualities: []string{"1", "4", "low", "medium", "high"}}
	view = image.Effective()
	if !reflect.DeepEqual(view.Resolutions, []string{"1K", "2k", "4k"}) || !reflect.DeepEqual(view.Qualities, imageQualityOptions) {
		t.Fatal(view)
	}
	for _, bad := range []ModelSettings{{Resolutions: []string{"auto"}}, {Resolutions: []string{"480p"}}, {Qualities: []string{"1"}}, {Ratios: []string{"9:21"}}} {
		if bad.Validate(image) == nil {
			t.Fatal("invalid image option accepted", bad)
		}
	}
	if (ModelSettings{Durations: []int{31}}).Validate(video) == nil {
		t.Fatal("31 seconds accepted")
	}
	if (ModelSettings{Resolutions: []string{"1k"}}).Validate(video) == nil {
		t.Fatal("video 1K accepted")
	}
	if !ParameterValuesAllowed("video", "768p", "21:9", "", 30) || ParameterValuesAllowed("video", "720p", "16:9", "", 31) || ParameterValuesAllowed("image", "auto", "1:1", "low", 0) {
		t.Fatal("request validation differs from catalog")
	}
}
