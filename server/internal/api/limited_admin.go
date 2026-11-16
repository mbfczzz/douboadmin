package api

import (
	"net/http"
	"strings"
)

// Fixed business permissions for every non-super administrator, irrespective of role menus.
func limitedAdminRoute(method, path string) bool {
	if method == http.MethodPost && path == "/api/auth/logout" {
		return true
	}
	if path == "/api/admin/me" || path == "/api/admin/me/logins" {
		return method == http.MethodGet
	}
	if path == "/api/admin/me/password" {
		return method == http.MethodPut
	}
	if method == http.MethodGet {
		switch path {
		case "/api/admin/roles/labels", "/api/admin/partners", "/api/admin/partners/tree", "/api/admin/commission-ledger", "/api/admin/commission-payouts":
			return true
		}
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 4 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "partners" && parts[3] != "" {
		if len(parts) == 4 {
			return method == http.MethodGet || method == http.MethodPut
		}
		return len(parts) == 5 && parts[4] == "activity" && method == http.MethodGet
	}
	return len(parts) == 5 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "orders" && parts[4] == "distribution" && method == http.MethodGet
}

// providerReviewRoute: routes a provider login (never a platform role) may
// reach for 下级小程序开通权限. Handlers check the switch and the subtree.
func providerReviewRoute(method, path string) bool {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "registrations" && parts[3] != "" {
		return method == http.MethodGet || method == http.MethodPut
	}
	return len(parts) == 5 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "partners" && parts[3] != "" && parts[4] == "member-registrations" && method == http.MethodGet
}
