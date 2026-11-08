package api

func (a *Server) businessRoutes() {
	m := a.Mux
	m.HandleFunc("POST /api/admin/jobs/{id}/release", a.auth("admin", a.releaseJob))
	m.HandleFunc("GET /api/admin/monitor", a.auth("admin", a.monitor))
	m.HandleFunc("GET /api/admin/logs", a.auth("admin", a.operationalRecords("error_logs")))
	m.HandleFunc("GET /api/admin/alerts", a.auth("admin", a.operationalRecords("alerts")))
	m.HandleFunc("PUT /api/admin/alerts/{id}/ack", a.auth("admin", a.acknowledgeAlert))
	m.HandleFunc("GET /api/admin/dashboard", a.auth("admin", a.dashboard))
	m.HandleFunc("POST /api/events", a.auth("user", a.track))
	m.HandleFunc("PUT /api/admin/users/{id}/status", a.auth("admin", a.userStatus))
	m.HandleFunc("PUT /api/admin/users/{id}", a.auth("admin", a.updateUser))
	m.HandleFunc("DELETE /api/admin/users/{id}", a.auth("admin", a.archiveUser))
	m.HandleFunc("GET /api/wallet", a.auth("user", a.wallet))
	m.HandleFunc("GET /api/wallet/ledger", a.auth("user", a.ledger))
	m.HandleFunc("POST /api/jobs/quote", a.auth("user", a.quoteJob))
	m.HandleFunc("GET /api/jobs/estimate", a.auth("user", a.estimateJob))
	m.HandleFunc("GET /api/preferences", a.auth("user", a.preferences))
	m.HandleFunc("PUT /api/preferences", a.auth("user", a.savePreferences))
	m.HandleFunc("GET /api/admin/platform", a.auth("admin", a.platformSettings))
	m.HandleFunc("PUT /api/admin/platform", a.auth("admin", a.savePlatform))
	m.HandleFunc("GET /api/admin/integrations", a.auth("admin", a.integrationSettings))
	m.HandleFunc("PUT /api/admin/integrations/{group}", a.superAdmin(a.saveIntegrationSettings))
	m.HandleFunc("GET /api/admin/users/{id}/ledger", a.auth("admin", a.ledger))
	m.HandleFunc("POST /api/admin/users/{id}/wallet", a.auth("admin", a.adjustWallet))
	m.HandleFunc("GET /api/admin/users/{id}/wallet", a.auth("admin", a.wallet))
}
