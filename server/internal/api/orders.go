package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func publicOrder(row core.Record) core.Record {
	var o core.Order
	_ = json.Unmarshal(row.Data, &o)
	o.OpenID = ""
	o.PrepayID = ""
	o.RequestHash = ""
	o.Distribution = nil
	row.Data = core.Data(o)
	return row
}
func (a *Server) orders(w http.ResponseWriter, r *http.Request) {
	owner := identity(r).ID
	if identity(r).Role == "admin" {
		owner = ""
	}
	rows, e := a.Store.List(r.Context(), "orders", owner)
	if e != nil {
		dbError(w, e)
		return
	}
	for i := range rows {
		rows[i] = publicOrder(rows[i])
	}
	reply(w, 200, rows)
}
func (a *Server) order(w http.ResponseWriter, r *http.Request) {
	row, e := a.Store.Get(r.Context(), "orders", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	if row.Owner != identity(r).ID && identity(r).Role != "admin" {
		fail(w, 404, "订单不存在")
		return
	}
	reply(w, 200, publicOrder(row))
}
func (a *Server) createOrder(w http.ResponseWriter, r *http.Request) {
	if a.Config.PaymentChannel == "wechat_virtual" {
		a.createVirtualOrder(w, r)
		return
	}
	var v struct {
		PricingVersion  string `json:"pricingVersion"`
		AmountFen       int64  `json:"amountFen"`
		SettingsVersion int64  `json:"settingsVersion"`
		Platform        string `json:"platform"`
	}
	if !decode(w, r, &v) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 8 || len(key) > 128 {
		fail(w, 400, "充值请求标识无效")
		return
	}
	settingsRow, settings, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	if !settings.RechargeEnabled || !a.Pay.Ready() {
		fail(w, 503, "积分充值暂未开放")
		return
	}
	if strings.EqualFold(v.Platform, "ios") && !a.Pay.Config.IOSAllowed {
		fail(w, 403, "当前设备暂未开放充值")
		return
	}
	if v.SettingsVersion != settingsRow.Version {
		fail(w, 409, "兑换价格已更新，请刷新确认后重新提交")
		return
	}
	user := identity(r).ID
	profile, e := a.Store.Get(r.Context(), "wechat_identities", user)
	if e != nil {
		fail(w, 401, "请重新微信登录后充值")
		return
	}
	var account struct {
		OpenID string `json:"openid"`
	}
	_ = json.Unmarshal(profile.Data, &account)
	if account.OpenID == "" {
		fail(w, 401, "请使用微信账号登录后充值")
		return
	}
	if v.AmountFen < settings.MinRechargeFen || v.AmountFen > settings.MaxRechargeFen {
		fail(w, 400, "充值金额超出允许范围")
		return
	}
	row, e := a.Billing.CreateOrder(r.Context(), user, key, v.AmountFen, settings, a.Pay.Config.AppID, a.Pay.Config.MerchantID, account.OpenID, v.PricingVersion)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 201, publicOrder(row))
}
func (a *Server) payOrder(w http.ResponseWriter, r *http.Request) {
	var client struct {
		Platform string `json:"platform"`
		Code     string `json:"code"`
	}
	if !decode(w, r, &client) {
		return
	}
	row, e := a.Store.Get(r.Context(), "orders", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	if row.Owner != identity(r).ID {
		fail(w, 404, "订单不存在")
		return
	}
	var o core.Order
	if json.Unmarshal(row.Data, &o) != nil {
		fail(w, 503, "订单信息异常")
		return
	}
	if o.Channel == "wechat_virtual" {
		a.payVirtualOrder(w, r, row, o, client.Code, client.Platform)
		return
	}
	if !a.Pay.Ready() {
		fail(w, 503, "微信支付暂未配置")
		return
	}
	_, settings, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	if !settings.RechargeEnabled || (strings.EqualFold(client.Platform, "ios") && !a.Pay.Config.IOSAllowed) {
		fail(w, 403, "当前暂未开放充值")
		return
	}
	if o.Status != "created" || !o.ExpiresAt.After(time.Now()) {
		fail(w, 409, "此订单已完成或过期，请刷新订单状态")
		return
	}
	if a.Config.RequireActivation && o.Distribution != nil {
		access, e := a.Partners.Access(r.Context(), row.Owner)
		if e != nil {
			dbError(w, e)
			return
		}
		if !access.Active || access.PartnerID != o.Distribution.PartnerID {
			fail(w, 409, "授权归属已变化，请创建新的充值订单")
			return
		}
	}
	id, e := a.Pay.Prepay(r.Context(), row.ID, o)
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	if e = a.Billing.SetPrepay(r.Context(), row.ID, id); e != nil {
		dbError(w, e)
		return
	}
	params, e := a.Pay.Parameters(r.Context(), id)
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	reply(w, 200, params)
}
func (a *Server) refreshOrder(w http.ResponseWriter, r *http.Request) {
	row, e := a.Store.Get(r.Context(), "orders", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	if row.Owner != identity(r).ID && identity(r).Role != "admin" {
		fail(w, 404, "订单不存在")
		return
	}
	allowed, e := a.Sessions.Allow(r.Context(), "order-query:"+row.ID, 6)
	if e != nil || !allowed {
		fail(w, 429, "查询过于频繁，请稍后再试")
		return
	}
	var o core.Order
	if json.Unmarshal(row.Data, &o) != nil {
		fail(w, 503, "订单信息异常")
		return
	}
	if o.Channel == "wechat_virtual" {
		if virtualpay.UnissuedPurchase(o) {
			reply(w, 200, publicOrder(row))
			return
		}
		if !a.Virtual.Ready() {
			fail(w, 503, "虚拟支付尚未配置")
			return
		}
		if e = a.Virtual.Refresh(r.Context(), row.ID); e != nil {
			fail(w, 502, e.Error())
			return
		}
		a.order(w, r)
		return
	}
	state, result, e := a.Pay.Query(r.Context(), row.ID)
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	if state == "SUCCESS" {
		e = a.Billing.Settle(r.Context(), result)
	} else if state == "CLOSED" {
		e = a.Billing.Close(r.Context(), row.ID)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	a.order(w, r)
}
