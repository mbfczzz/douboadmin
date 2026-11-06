package api

func (a *Server) paymentRoutes() {
	m := a.Mux
	m.HandleFunc("GET /api/payments/virtual/notify", a.virtualNotify)
	m.HandleFunc("POST /api/payments/virtual/notify", a.virtualNotify)
	m.HandleFunc("GET /api/admin/virtual-payments/events", a.auth("admin", a.virtualEvents))
	m.HandleFunc("POST /api/admin/virtual-payments/events/{id}/retry", a.auth("admin", a.retryVirtualEvent))
	m.HandleFunc("POST /api/admin/virtual-payments/events/{id}/review", a.auth("admin", a.reviewVirtualEvent))
	m.HandleFunc("GET /api/admin/payments", a.auth("admin", a.paymentRecords))
	m.HandleFunc("GET /api/orders", a.auth("user", a.orders))
	m.HandleFunc("POST /api/orders", a.auth("user", a.createOrder))
	m.HandleFunc("GET /api/orders/{id}", a.auth("user", a.order))
	m.HandleFunc("POST /api/orders/{id}/pay", a.auth("user", a.payOrder))
	m.HandleFunc("POST /api/orders/{id}/refresh", a.auth("user", a.refreshOrder))
	m.HandleFunc("POST /api/payments/wechat/notify", a.paymentNotify)
	m.HandleFunc("POST /api/payments/wechat/refund-notify", a.refundNotify)
	m.HandleFunc("GET /api/admin/orders", a.auth("admin", a.orders))
	m.HandleFunc("GET /api/admin/orders/{id}", a.auth("admin", a.order))
	m.HandleFunc("POST /api/admin/orders/{id}/refresh", a.auth("admin", a.refreshOrder))
	m.HandleFunc("POST /api/admin/orders/{id}/refund", a.auth("admin", a.createRefund))
	m.HandleFunc("GET /api/admin/refunds", a.auth("admin", a.refunds))
	m.HandleFunc("POST /api/admin/refunds/{id}/refresh", a.auth("admin", a.refreshRefund))
}
