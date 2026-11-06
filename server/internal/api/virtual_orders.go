package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func (a *Server) rechargeReady() bool {
	if a.Config.PaymentChannel == virtualpay.Channel {
		return a.Virtual.Enabled()
	}
	return a.Pay.Ready()
}
func (a *Server) rechargeIOS() bool {
	if a.Config.PaymentChannel == virtualpay.Channel {
		return a.Virtual.Enabled() && a.Virtual.Client.Config.IOSAllowed
	}
	return a.Pay != nil && a.Pay.Config.IOSAllowed
}
func (a *Server) virtualProducts(settings core.PlatformSettings, retail int64) []virtualpay.Product {
	out := []virtualpay.Product{}
	if !a.Virtual.Enabled() || retail <= 0 {
		return out
	}
	for _, p := range a.Virtual.Client.Config.Products {
		if p.AmountFen >= settings.MinRechargeFen && p.AmountFen <= settings.MaxRechargeFen && p.PointsUnits == p.AmountFen*settings.PointsPerYuan*10000/retail {
			out = append(out, p)
		}
	}
	return out
}
func (a *Server) createVirtualOrder(w http.ResponseWriter, r *http.Request) {
	var v struct {
		ProductID       string `json:"productId"`
		SettingsVersion int64  `json:"settingsVersion"`
		PricingVersion  string `json:"pricingVersion"`
		Platform        string `json:"platform"`
	}
	if !decode(w, r, &v) {
		return
	}
	if !a.Virtual.Enabled() {
		fail(w, 503, "虚拟支付尚未配置或开通")
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
	if !settings.RechargeEnabled {
		fail(w, 503, "积分充值暂未开放")
		return
	}
	if v.SettingsVersion != settingsRow.Version {
		fail(w, 409, "兑换价格已更新，请刷新确认")
		return
	}
	cfg := a.Virtual.Client.Config
	p, ok := cfg.Product(v.ProductID)
	if !ok {
		fail(w, 400, "请选择已配置的积分商品")
		return
	}
	platform := strings.ToLower(v.Platform)
	if platform == "ios" && (!cfg.IOSAllowed || cfg.Env != 0 || p.AmountFen < 100) {
		fail(w, 403, "当前商品暂不支持此设备充值")
		return
	}
	user := identity(r).ID
	row, e := a.Store.Get(r.Context(), "wechat_identities", user)
	if e != nil {
		fail(w, 401, "请重新微信登录后充值")
		return
	}
	var account struct {
		OpenID string `json:"openid"`
	}
	if json.Unmarshal(row.Data, &account) != nil || account.OpenID == "" {
		fail(w, 401, "请使用微信账号登录")
		return
	}
	order, e := a.Billing.CreateVirtualOrder(r.Context(), user, key, p.AmountFen, settings, cfg.AppID, cfg.OfferID, account.OpenID, v.PricingVersion, core.VirtualOrder{ProductID: p.ID, ProductName: p.Name, PointsUnits: p.PointsUnits, Env: cfg.Env, Platform: platform})
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 201, publicOrder(order))
}
func (a *Server) payVirtualOrder(w http.ResponseWriter, r *http.Request, row core.Record, o core.Order, code, platform string) {
	if !a.Virtual.Enabled() {
		fail(w, 503, "虚拟支付尚未配置或开通")
		return
	}
	_, settings, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	if !settings.RechargeEnabled {
		fail(w, 403, "当前暂未开放充值")
		return
	}
	if o.Virtual == nil || o.Status != "created" || !o.ExpiresAt.After(time.Now()) {
		fail(w, 409, "订单已完成或过期")
		return
	}
	if o.Virtual.Issued {
		fail(w, 409, "支付单号已签发，请查询结果或创建新订单")
		return
	}
	cfg := a.Virtual.Client.Config
	if a.WeChat == nil || a.WeChat.AppID != cfg.AppID {
		fail(w, 503, "微信登录与虚拟支付应用不一致")
		return
	}
	if strings.EqualFold(platform, "ios") && (!cfg.IOSAllowed || o.Virtual.Env != 0 || o.AmountFen < 100) {
		fail(w, 403, "当前设备暂未开放充值")
		return
	}
	p, ok := cfg.Product(o.Virtual.ProductID)
	if !ok || p.AmountFen != o.AmountFen || p.PointsUnits != o.PointsUnits || o.Virtual.Env != cfg.Env {
		fail(w, 409, "商品或支付环境已更新，请创建新订单")
		return
	}
	if a.Config.RequireActivation {
		access, err := a.Partners.Access(r.Context(), row.Owner)
		if err != nil {
			dbError(w, err)
			return
		}
		if !access.Active || (o.Distribution != nil && access.PartnerID != o.Distribution.PartnerID) {
			fail(w, 409, "授权归属已变化，请创建新订单")
			return
		}
	}
	session, e := a.WeChat.ExchangeSession(r.Context(), code)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	if session.OpenID != o.OpenID || session.Key == "" {
		fail(w, 403, "微信支付身份与订单不一致")
		return
	}
	params, e := a.Virtual.Client.Parameters(row.ID, o, session.Key)
	if e != nil {
		fail(w, 503, e.Error())
		return
	}
	if e = a.Virtual.ClaimSignature(r.Context(), row.ID); e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, params)
}
