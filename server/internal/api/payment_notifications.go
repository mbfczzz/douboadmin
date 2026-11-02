package api

import (
	"net/http"
)

func (a *Server) paymentNotify(w http.ResponseWriter, r *http.Request) {
	if !a.Pay.Ready() {
		fail(w, 503, "支付服务未配置")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	result, e := a.Pay.PaymentNotification(r)
	if e != nil {
		fail(w, 400, "通知校验失败")
		return
	}
	if e = a.Billing.Settle(r.Context(), result); e != nil {
		dbError(w, e)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (a *Server) refundNotify(w http.ResponseWriter, r *http.Request) {
	if !a.Pay.Ready() {
		fail(w, 503, "支付服务未配置")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	result, e := a.Pay.RefundNotification(r)
	if e != nil {
		fail(w, 400, "通知校验失败")
		return
	}
	if e = a.Billing.FinishRefund(r.Context(), result); e != nil {
		dbError(w, e)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
