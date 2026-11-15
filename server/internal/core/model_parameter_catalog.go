package core

import (
	"slices"
	"strings"
)

var imageResolutionOptions = []string{"1k", "2k", "4k"}
var videoResolutionOptions = []string{"480p", "720p", "768p", "1080p", "2k", "4k"}
var imageQualityOptions = []string{"low", "medium", "high"}
var ratioOptions = []string{"1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"}

func fixedOptions(values, allowed []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, v := range values {
		key := strings.ToLower(v)
		if slices.Contains(allowed, key) && !seen[key] {
			out = append(out, v)
			seen[key] = true
		}
	}
	return out
}

func (m Model) fixedParameters() Model {
	if m.Kind == "image" {
		m.Resolutions = fixedOptions(m.Resolutions, imageResolutionOptions)
		m.Qualities = fixedOptions(m.Qualities, imageQualityOptions)
	}
	if m.Kind == "video" {
		m.Resolutions = fixedOptions(m.Resolutions, videoResolutionOptions)
		out := []int{}
		for _, n := range m.Durations {
			if n >= 1 && n <= 30 && !slices.Contains(out, n) {
				out = append(out, n)
			}
		}
		slices.Sort(out)
		m.Durations = out
	}
	if m.Kind == "image" || m.Kind == "video" {
		m.Ratios = fixedOptions(m.Ratios, ratioOptions)
	}
	return m
}

func validModelParameterOptions(s ModelSettings, kind string) bool {
	if !validParameterOptions(s.Resolutions) || !validParameterOptions(s.Ratios) || !validParameterOptions(s.Qualities) || !validDurationOptions(s.Durations) {
		return false
	}
	if kind == "image" && (len(fixedOptions(s.Resolutions, imageResolutionOptions)) != len(s.Resolutions) || len(fixedOptions(s.Qualities, imageQualityOptions)) != len(s.Qualities)) {
		return false
	}
	if kind == "video" && len(fixedOptions(s.Resolutions, videoResolutionOptions)) != len(s.Resolutions) {
		return false
	}
	return (kind != "image" && kind != "video") || len(fixedOptions(s.Ratios, ratioOptions)) == len(s.Ratios)
}

func ParameterValuesAllowed(kind, resolution, ratio, quality string, duration int) bool {
	if kind != "image" && kind != "video" {
		return true
	}
	allowed := imageResolutionOptions
	if kind == "video" {
		allowed = videoResolutionOptions
	}
	if resolution != "" && !slices.Contains(allowed, strings.ToLower(resolution)) {
		return false
	}
	if ratio != "" && !slices.Contains(ratioOptions, ratio) {
		return false
	}
	if kind == "image" && quality != "" && !slices.Contains(imageQualityOptions, strings.ToLower(quality)) {
		return false
	}
	return kind != "video" || duration >= 1 && duration <= 30
}
