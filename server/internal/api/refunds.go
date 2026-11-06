package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"strings"
)

func (a *Server) refunds(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.List(r.Context(), "refunds", "")
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, rows)
}
func (a *Server) createRefund(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &v) {
		return
	}
	v.Reason = strings.TrimSpace(v.Reason)
	if v.Reason == "" || len(v.Reason) > 80 {
		fail(w, 400, "退款原因请控制在 25 个汉字以内")
		return
	}
	orderRow, lookupErr := a.Store.Get(r.Context(), "orders", r.PathValue("id"))
	if lookupErr != nil {
		dbError(w, lookupErr)
		return
	}
	var order core.Order
	if json.Unmarshal(orderRow.Data, &order) != nil {
		fail(w, 503, "订单信息异常")
		return
	}
	if order.Channel == "wechat_virtual" {
		if !a.Virtual.Ready() {
			fail(w, 503, "虚拟支付尚未配置")
			return
		}
		row, err := a.Virtual.StartRefund(r.Context(), orderRow.ID, v.Reason, identity(r).ID)
		if err != nil {
			fail(w, 502, err.Error())
			return
		}
		reply(w, 200, row)
		return
	}
	if !a.Pay.Ready() {
		fail(w, 503, "微信支付尚未配置")
		return
	}
	row, e := a.Billing.StartRefund(r.Context(), r.PathValue("id"), v.Reason, identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	var refund core.Refund
	_ = json.Unmarshal(row.Data, &refund)
	result, e := a.Pay.Refund(r.Context(), row.ID, refund)
	if e != nil {
		fail(w, 502, "退款已进入待处理队列，暂未确认微信受理结果；可使用原退款单重试")
		return
	}
	if e = a.Billing.FinishRefund(r.Context(), result); e != nil {
		dbError(w, e)
		return
	}
	updated, e := a.Store.Get(r.Context(), "refunds", row.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, updated)
}
func (a *Server) refreshRefund(w http.ResponseWriter, r *http.Request) {
	row, e := a.Store.Get(r.Context(), "refunds", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	var refund core.Refund
	if json.Unmarshal(row.Data, &refund) != nil {
		fail(w, 503, "退款记录异常")
		return
	}
	if refund.Channel == "wechat_virtual" {
		if !a.Virtual.Ready() {
			fail(w, 503, "虚拟支付尚未配置")
			return
		}
		if e = a.Virtual.RefreshRefund(r.Context(), row.ID); e != nil {
			fail(w, 502, e.Error())
			return
		}
		updated, err := a.Store.Get(r.Context(), "refunds", row.ID)
		if err != nil {
			dbError(w, err)
			return
		}
		reply(w, 200, updated)
		return
	}
	result, e := a.Pay.QueryRefund(r.Context(), row.ID)
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	if e = a.Billing.FinishRefund(r.Context(), result); e != nil {
		dbError(w, e)
		return
	}
	row, e = a.Store.Get(r.Context(), "refunds", row.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
