package api

import (
	"doubo/server/internal/arkvideo"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
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
		snapshot, err := a.Partners.UserPurchaseQuote(r.Context(), user, 100)
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
		} else if snapshot != nil {
			pricing["retailPer100Fen"] = snapshot.RetailPer100Fen
			pricing["version"] = snapshot.PricingVersion
		}
	}
	products := a.virtualProducts()
	custom := a.virtualCustom()
	channel := a.Config.PaymentChannel
	if channel == "" {
		channel = "wechat_jsapi"
	}
	ready := a.rechargeReady() && !browseOnly(r)
	if channel == "wechat_virtual" && len(products) == 0 && custom == nil {
		ready = false
	}
	reply(w, 200, map[string]any{"wallet": value, "settings": settings, "settingsVersion": row.Version, "pricing": pricing, "paymentReady": ready, "iosPayment": a.rechargeIOS(), "paymentChannel": channel, "virtualProducts": products, "virtualCustom": custom})
}
func (a *Server) ledger(w http.ResponseWriter, r *http.Request) {
	user := identity(r).ID
	if identity(r).Role == "admin" {
		user = r.PathValue("id")
	}
	query, ok := financeQuery(w, r, "wallet_ledger", user)
	if !ok {
		return
	}
	// Users see points taken at submit and returned on failure; settling an
	// already-taken charge changes nothing they can spend, so it is not listed.
	if identity(r).Role != "admin" {
		query.NotFields = map[string]string{"availableDelta": "0"}
	}
	page, e := a.Store.RecordPage(r.Context(), query)
	if e != nil {
		dbError(w, e)
		return
	}
	if identity(r).Role != "admin" {
		// Users see amounts and the note, not which admin acted or the
		// internal reference (idempotency keys, job/order ids).
		for i := range page.Items {
			var entry core.LedgerEntry
			if json.Unmarshal(page.Items[i].Data, &entry) == nil {
				entry.Actor, entry.Reference = "", ""
				if entry.Kind == "job_hold" { // older entries say 生成任务预留积分
					entry.Note = store.HoldNote
				}
				page.Items[i].Data = core.Data(entry)
			}
		}
	}
	financeReply(w, r, page)
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

// jobPrice is what a job costs: the generation plus any 参考视频计费.
type jobPrice struct {
	Units, ReferenceUnits int64
	Estimated             *int64
	Enabled, PerSecond    bool
	PerToken              bool
}

func (a *Server) priceInput(r *http.Request, in core.JobInput) (p jobPrice, err error) {
	if !core.IsGeneration(in.Kind) {
		return p, fmt.Errorf("该任务类型暂未开放")
	}
	_, settings, err := a.platform(r.Context())
	if err != nil {
		return
	}
	p.Enabled = settings.BillingEnabled
	m, err := a.model(r.Context(), in.Model)
	if err != nil {
		return p, err
	}
	if p.Units, p.PerSecond, err = billing.QuoteDetail(m, in); err != nil {
		return p, err
	}
	p.PerToken = in.Kind == "chat" && m.Settings.TokenPriced()
	_, ark := core.ArkVideo(m.Key)
	switch {
	case !p.Enabled || in.Kind != "video": // free generation never reads the reference videos
	case ark:
		// 火山方舟 counts input video seconds too; settled on reported usage.
		p.PerToken = true
		seconds, err := a.referenceSeconds(r.Context(), in)
		if err == nil {
			arkID, _ := core.ArkVideo(m.Key)
			err = arkvideo.CheckReferences(arkID, a.assetCounts(r.Context(), in), seconds)
		}
		if err == nil {
			p.Units, err = billing.ArkVideoHold(m, in, seconds)
		}
		if err != nil {
			return p, err
		}
	case m.Settings.ReferenceVideoBilling:
		seconds, err := a.referenceSeconds(r.Context(), in)
		if err == nil {
			p.ReferenceUnits, err = core.ReferenceVideoUnits(m, in, seconds)
		}
		if err != nil {
			return p, err
		}
		p.Units += p.ReferenceUnits
	}
	if m.Settings.CostUSD != "" {
		if cost, e := strconv.ParseFloat(m.Settings.CostUSD, 64); e == nil {
			micros := int64(cost*1e6 + .5)
			p.Estimated = &micros
		}
	}
	return
}
func (a *Server) quoteJob(w http.ResponseWriter, r *http.Request) {
	var in core.JobInput
	if !decode(w, r, &in) {
		return
	}
	allowReferenceReads(w, in.Assets)
	if e := a.validateJob(r.Context(), identity(r).ID, &in); e != nil {
		fail(w, 400, e.Error())
		return
	}
	p, e := a.priceInput(r, in)
	if e != nil {
		quoteError(w, e)
		return
	}
	wallet, e := a.Billing.Wallet(r.Context(), identity(r).ID)
	if e != nil {
		dbError(w, e)
		return
	}
	charge := p.Units
	if !p.Enabled {
		charge = 0
	}
	// perSecond lets the confirm dialog say 按秒 (duration table) or 按次;
	// perToken (按量) means units is the most this chat turn can cost;
	// referenceUnits is the 参考视频计费 part of units.
	reply(w, 200, map[string]any{"units": charge, "configuredUnits": p.Units, "billingEnabled": p.Enabled, "availableUnits": wallet.Available, "sufficient": wallet.Available >= charge, "perSecond": p.PerSecond, "perToken": p.PerToken, "referenceUnits": p.ReferenceUnits})
}
