package core

import (
	"strings"
	"unicode"
)

func validParameterOptions(values []string) bool {
	if len(values) > 40 {
		return false
	}
	seen := map[string]bool{}
	for _, v := range values {
		if v == "" || len(v) > 32 || strings.TrimSpace(v) != v || seen[v] {
			return false
		}
		for _, r := range v {
			if unicode.IsControl(r) {
				return false
			}
		}
		seen[v] = true
	}
	return true
}

func validDurationOptions(values []int) bool {
	if len(values) > 30 {
		return false
	}
	seen := map[int]bool{}
	for _, v := range values {
		if v < 1 || v > 30 || seen[v] {
			return false
		}
		seen[v] = true
	}
	return true
}
