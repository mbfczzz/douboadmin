package api

import (
	"context"
	"net/http"

	"doubo/server/internal/core"
)

type browseContextKey struct{}

func canBrowse(access core.Access, registered bool) bool {
	return registered && (access.Active || access.Status == "review")
}

// Explicitly reviewed local reads. Some GETs call paid upstream services or
// issue invitation codes, so GET alone must never grant preview access.
var browseReads = map[string]bool{
	"GET /api/templates":           true,
	"GET /api/templates/{id}":      true,
	"GET /api/me":                  true,
	"GET /api/me/identity":         true,
	"GET /api/jobs":                true,
	"GET /api/jobs/{id}":           true,
	"GET /api/jobs/estimate":       true,
	"GET /api/assets/{id}":         true,
	"GET /api/works":               true,
	"GET /api/favorites":           true,
	"GET /api/favorites/templates": true,
	"GET /api/favorites/{id}":      true,
	"GET /api/wallet":              true,
	"GET /api/wallet/ledger":       true,
	"GET /api/orders":              true,
	"GET /api/orders/{id}":         true,
	"GET /api/preferences":         true,
	"GET /api/notifications":       true,
	"GET /api/hot/discovery":       true,
	"GET /api/hot/history":         true,
	"GET /api/shares/{token}":      true,
}

func browseOnly(r *http.Request) bool {
	value, _ := r.Context().Value(browseContextKey{}).(bool)
	return value
}

func browsingContext(ctx context.Context, preview bool) context.Context {
	if !preview {
		return ctx
	}
	return context.WithValue(ctx, browseContextKey{}, preview)
}
