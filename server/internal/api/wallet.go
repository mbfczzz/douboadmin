package api

import (
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

func (a *Server) wallet(w http.ResponseWriter, r *http.Request) {
	user := identity(r).ID
	if identity(r).Role == "admin" {
		user = r.PathValue("id")
	}
	value, e := a.Billing.Wallet(r.Context(), user)
	if e != nil {
		dbError(w, e)
		return
	}
	row, settings, e := a.platform(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	pricing := map[string]any{"ready": true, "retailPer100Fen": 10000, "version": ""}
	if a.Config.RequireActivation {
		snapshot, _, err := a.Partners.UserQuote(r.Context(), user, 100, settings.PointsPerYuan)
		if err != nil {
			var rule *partners.RuleError
			adminDisabled := identity(r).Role == "admin" && errors.Is(err, core.ErrUserDisabled)
			if !adminDisabled && !errors.As(err, &rule) && !errors.Is(err, core.ErrActivationRequired) && !errors.Is(err, core.ErrPartnerDisabled) {
				dbError(w, err)
				return
			}
			pricing["ready"] = false
			pricing["message"] = err.Error()
			if identity(r).Role == "user" {
				pricing["message"] = "充值暂未开放，请联系服务商"
			}
		} else {
			pricing["retailPer100Fen"] = snapshot.RetailPer100Fen
			pricing["version"] = snapshot.PricingVersion
		}
	}
	reply(w, 200, map[string]any{"wallet": value, "settings": settings, "settingsVersion": row.Version, "pricing": pricing, "paymentReady": a.Pay.Ready(), "iosPayment": a.Pay != nil && a.Pay.Config.IOSAllowed})
}
func (a *Server) ledger(w http.ResponseWriter, r *http.Request) {
	user := identity(r).ID
	if identity(r).Role == "admin" {
		user = r.PathValue("id")
	}
	rows, e := a.Store.List(r.Context(), "wallet_ledger", user)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, rows)
}
func (a *Server) adjustWallet(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Units int64  `json:"units"`
		Note  string `json:"note"`
	}
	if !decode(w, r, &v) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	v.Note = strings.TrimSpace(v.Note)
	if len(key) < 8 || len(key) > 128 || v.Units == 0 || len([]rune(v.Note)) < 3 || len([]rune(v.Note)) > 200 {
		fail(w, 400, "请填写有效积分变动和调整原因")
		return
	}
	user := r.PathValue("id")
	if _, e := a.Store.Get(r.Context(), "users", user); e != nil {
		dbError(w, e)
		return
	}
	value, e := a.Billing.Adjust(r.Context(), user, key, identity(r).ID, v.Note, v.Units)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, value)
}
func (a *Server) priceInput(r *http.Request, in core.JobInput) (units int64, estimated *int64, enabled bool, err error) {
	if !core.IsGeneration(in.Kind) {
		return 0, nil, false, fmt.Errorf("该任务类型暂未开放")
	}
	_, settings, err := a.platform(r.Context())
	if err != nil {
		return
	}
	enabled = settings.BillingEnabled
	m, err := a.model(r.Context(), in.Model)
	if err != nil {
		return 0, nil, enabled, err
	}
	units, err = billing.Quote(m, in)
	if m.Settings.CostUSD != "" {
		if cost, e := strconv.ParseFloat(m.Settings.CostUSD, 64); e == nil {
			micros := int64(cost*1e6 + .5)
			estimated = &micros
		}
	}
	return
}
func (a *Server) quoteJob(w http.ResponseWriter, r *http.Request) {
	var in core.JobInput
	if !decode(w, r, &in) {
		return
	}
	if !core.IsGeneration(in.Kind) {
		fail(w, 400, "该任务类型暂未开放")
		return
	}
	units, _, enabled, e := a.priceInput(r, in)
	if e != nil {
		dbError(w, e)
		return
	}
	wallet, e := a.Billing.Wallet(r.Context(), identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	charge := units
	if !enabled {
		charge = 0
	}
	reply(w, 200, map[string]any{"units": charge, "configuredUnits": units, "billingEnabled": enabled, "availableUnits": wallet.Available, "sufficient": wallet.Available >= charge})
}
