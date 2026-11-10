package api

import (
	"context"
	"net/http"
	"time"
)

func (a *Server) routes() {
	a.partnerRoutes()
	a.businessRoutes()
	a.paymentRoutes()
	a.contentRoutes()
	a.hotRoutes()
	a.auditRoutes()
	m := a.Mux
	m.HandleFunc("GET /health/live", func(w http.ResponseWriter, r *http.Request) { reply(w, 200, map[string]bool{"ok": true}) })
	m.HandleFunc("GET /health/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := a.Store.Ping(ctx); err != nil {
			dbError(w, err)
			return
		}
		if a.Sessions.Redis != nil {
			if err := a.Sessions.Redis.Ping(ctx).Err(); err != nil {
				dbError(w, err)
				return
			}
		}
		reply(w, 200, map[string]bool{"ok": true})
	})
	m.HandleFunc("GET /api/config", a.config)
	m.HandleFunc("POST /api/auth/login", a.login)
	m.HandleFunc("POST /api/auth/wechat", a.login)
	m.HandleFunc("POST /api/admin/login", a.adminLogin)
	m.HandleFunc("GET /api/admin/me", a.auth("admin", a.adminMe))
	m.HandleFunc("PUT /api/admin/me/password", a.auth("admin", a.changeOwnPassword))
	m.HandleFunc("GET /api/admin/me/logins", a.auth("admin", a.myLogins))
	m.HandleFunc("GET /api/admin/roles", a.auth("admin", a.listAdminRoles))
	m.HandleFunc("POST /api/admin/roles", a.superAdmin(a.saveAdminRole))
	m.HandleFunc("PUT /api/admin/roles/{id}", a.superAdmin(a.saveAdminRole))
	m.HandleFunc("DELETE /api/admin/roles/{id}", a.superAdmin(a.deleteAdminRole))
	m.HandleFunc("GET /api/admin/accounts", a.auth("admin", a.adminAccounts))
	m.HandleFunc("POST /api/admin/accounts", a.superAdmin(a.createAdminAccount))
	m.HandleFunc("PUT /api/admin/accounts/{id}", a.superAdmin(a.platformAccountOnly(a.updateAdminAccount)))
	m.HandleFunc("PUT /api/admin/accounts/{id}/password", a.superAdmin(a.platformAccountOnly(a.resetAdminPassword)))
	m.HandleFunc("DELETE /api/admin/accounts/{id}", a.superAdmin(a.platformAccountOnly(a.archiveAdminAccount)))
	m.HandleFunc("POST /api/auth/logout", a.auth("", a.logout))
	m.HandleFunc("GET /api/templates", a.business(a.templates))
	m.HandleFunc("GET /api/templates/{id}", a.business(a.template))
	m.HandleFunc("GET /api/me", a.auth("user", a.me))
	m.HandleFunc("GET /api/me/identity", a.auth("user", a.myIdentity))
	m.HandleFunc("PUT /api/me", a.auth("user", a.updateMe))
	m.HandleFunc("GET /api/jobs", a.auth("user", a.jobs))
	m.HandleFunc("POST /api/jobs", a.auth("user", a.createJob))
	m.HandleFunc("GET /api/jobs/{id}", a.auth("user", a.job))
	m.HandleFunc("POST /api/jobs/{id}/retry", a.auth("user", a.retry))
	m.HandleFunc("POST /api/assets", a.auth("user", a.upload))
	m.HandleFunc("GET /api/assets/{id}", a.auth("user", a.asset))
	m.HandleFunc("GET /api/favorites", a.auth("user", a.favorites))
	m.HandleFunc("GET /api/favorites/templates", a.auth("user", a.favoriteTemplates))
	m.HandleFunc("GET /api/favorites/{id}", a.auth("user", a.favoriteState))
	m.HandleFunc("PUT /api/favorites/{id}", a.auth("user", a.favorite))
	m.HandleFunc("POST /api/feedback", a.auth("user", a.feedback))
	m.HandleFunc("GET /api/admin/overview", a.auth("admin", a.overview))
	m.HandleFunc("GET /api/admin/templates", a.auth("admin", a.templates))
	m.HandleFunc("GET /api/admin/templates/categories", a.auth("admin", a.templateCategories))
	m.HandleFunc("POST /api/admin/assets", a.auth("admin", a.upload))
	m.HandleFunc("GET /api/admin/models", a.auth("admin", a.models))
	m.HandleFunc("POST /api/admin/models", a.auth("admin", a.importModel))
	m.HandleFunc("POST /api/admin/models/sync", a.auth("admin", a.syncModels))
	m.HandleFunc("PUT /api/admin/models/{id}", a.auth("admin", a.saveModel))
	m.HandleFunc("DELETE /api/admin/models/{id}", a.auth("admin", a.deleteRecord("models")))
	m.HandleFunc("DELETE /api/admin/templates/{id}", a.auth("admin", a.deleteRecord("templates")))
	m.HandleFunc("PUT /api/admin/templates/{id}", a.auth("admin", a.saveTemplate))
	m.HandleFunc("GET /api/admin/jobs", a.auth("admin", a.jobs))
	m.HandleFunc("POST /api/admin/jobs", a.auth("admin", a.createJob))
	m.HandleFunc("POST /api/admin/jobs/{id}/resume", a.auth("admin", a.resumeJob))
	m.HandleFunc("GET /api/admin/users", a.auth("admin", a.users))
	m.HandleFunc("GET /api/admin/feedback", a.auth("admin", a.simpleList("feedback")))
	m.HandleFunc("GET /media/", a.mediaFile)
}
