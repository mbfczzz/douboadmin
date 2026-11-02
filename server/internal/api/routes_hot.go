package api

func (a *Server) hotRoutes() {
	m := a.Mux
	m.HandleFunc("GET /api/hot/discovery", a.business(a.hotDiscovery))
	m.HandleFunc("GET /api/hot/videos", a.auth("user", a.hotSearch))
	m.HandleFunc("GET /api/hot/videos/{id}", a.auth("user", a.hotDetail))
	m.HandleFunc("POST /api/hot/videos/{id}/import", a.auth("user", a.importHot))
	m.HandleFunc("GET /api/hot/history", a.auth("user", a.searchHistory))
	m.HandleFunc("DELETE /api/hot/history", a.auth("user", a.searchHistory))
}
