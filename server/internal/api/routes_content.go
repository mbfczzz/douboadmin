package api

func (a *Server) contentRoutes() {
	m := a.Mux
	m.HandleFunc("POST /api/shares", a.auth("user", a.createShare))
	m.HandleFunc("GET /api/shares/{token}", a.business(a.shareData))
	m.HandleFunc("GET /s/{token}", a.shareHTML)
	m.HandleFunc("GET /api/notifications", a.auth("user", a.notifications))
	m.HandleFunc("POST /api/notifications/read-all", a.auth("user", a.readAllNotifications))
	m.HandleFunc("PUT /api/notifications/{id}/read", a.auth("user", a.readNotification))
	m.HandleFunc("GET /api/works", a.auth("user", a.works))
	m.HandleFunc("DELETE /api/works/{id}", a.auth("user", a.deleteWork))
	m.HandleFunc("GET /api/admin/works", a.auth("admin", a.works))
	m.HandleFunc("DELETE /api/admin/works/{id}", a.auth("admin", a.deleteWork))
	m.HandleFunc("GET /api/admin/reviews", a.auth("admin", a.reviews))
	m.HandleFunc("PUT /api/admin/reviews/{id}", a.auth("admin", a.reviewWork))
}
