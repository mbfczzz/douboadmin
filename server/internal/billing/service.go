package billing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"
)

type Service struct {
	Store             store.Store
	RequireActivation bool
	BeforePayment     func(store.Transaction) error
}

func (s *Service) Wallet(ctx context.Context, user string) (core.Wallet, error) {
	r, e := s.Store.Get(ctx, "wallets", user)
	w := core.Wallet{UserID: user}
	if errors.Is(e, core.ErrNotFound) {
		return w, nil
	}
	if e != nil {
		return w, e
	}
	e = json.Unmarshal(r.Data, &w)
	return w, e
}
func (s *Service) Adjust(ctx context.Context, user, key, actor, note string, units int64) (wallet core.Wallet, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		var e error
		wallet, e = store.ApplyFunds(tx, core.LedgerEntry{UserID: user, Reference: "adjust:" + key, Kind: "admin_adjust", AvailableDelta: units, Actor: actor, Note: note})
		return e
	})
	return
}

func Quote(model core.Model, input core.JobInput) (int64, error) {
	price := model.Points
	s := model.Settings
	if input.Kind == "image" || input.Kind == "video" {
		row := input.Quality
		if row == "" {
			row = "default"
		}
		if input.Kind == "video" {
			row = strconv.Itoa(input.Duration) + "s"
		}
		if input.Kind == "video" && s.VideoBillingMode == "per_request" {
			if p, configured := s.PricePerRequestByResolution[input.Resolution]; configured {
				price = p
			}
		} else if p, configured := s.PriceMatrix[row][input.Resolution]; configured {
			price = p
		}
	}
	return core.PointUnits(price)
}

func (s *Service) CreateOrder(ctx context.Context, user, key string, fen int64, settings core.PlatformSettings, appid, mchid, openid string, pricingVersion ...string) (out core.Record, err error) {
	return s.createOrder(ctx, user, key, fen, settings, appid, mchid, openid, nil, pricingVersion...)
}
func (s *Service) CreateVirtualOrder(ctx context.Context, user, key string, fen int64, settings core.PlatformSettings, appid, offerid, openid, pricingVersion string, goods core.VirtualOrder) (core.Record, error) {
	return s.createOrder(ctx, user, key, fen, settings, appid, offerid, openid, &goods, pricingVersion)
}
func (s *Service) createOrder(ctx context.Context, user, key string, fen int64, settings core.PlatformSettings, appid, mchid, openid string, goods *core.VirtualOrder, pricingVersion ...string) (out core.Record, err error) {
	if fen < 1 || fen > core.MaxOrderAmountFen || (goods == nil && (fen < settings.MinRechargeFen || fen > settings.MaxRechargeFen)) {
		return out, fmt.Errorf("充值金额超出允许范围")
	}
	if goods == nil && (settings.PointsPerYuan < 1 || settings.PointsPerYuan > 100000) {
		return out, fmt.Errorf("兑换比例尚未配置")
	}
	// fen * points/yuan already equals hundredths of a point, with no floating-point conversion.
	units := int64(0)
	if goods == nil {
		units = fen * settings.PointsPerYuan
	}
	order := core.Order{UserID: user, AmountFen: fen, PointsUnits: units, Status: "created", Channel: "wechat_jsapi", AppID: appid, MerchantID: mchid, OpenID: openid, ExpiresAt: time.Now().UTC().Add(30 * time.Minute), RequestHash: core.Digest(strconv.FormatInt(fen, 10))}
	if goods != nil {
		quantity, unitFen, e := goods.PurchaseDetails(fen)
		if e != nil {
			return out, e
		}
		if goods.PointsUnits < 1 || goods.PointsUnits > core.MaxBalance {
			return out, core.ErrPaymentMismatch
		}
		order.Channel, order.Virtual, order.PointsUnits = "wechat_virtual", goods, goods.PointsUnits
		order.RequestHash = core.Digest(string(core.Data([]any{fen, appid, mchid, goods.ProductID, goods.PointsUnits, goods.Env})))
		if quantity > 1 {
			order.RequestHash = core.Digest(string(core.Data([]any{order.RequestHash, quantity, unitFen})))
		}
	}
	id := core.Digest("recharge:" + user + ":" + key)[:32]
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		if r, e := tx.Get("orders", id); e == nil {
			var old core.Order
			if json.Unmarshal(r.Data, &old) != nil {
				return fmt.Errorf("订单数据异常")
			}
			if old.RequestHash != order.RequestHash {
				return core.ErrIdempotency
			}
			out = r
			return nil
		} else if !errors.Is(e, core.ErrNotFound) {
			return e
		}
		if s.BeforePayment != nil {
			if e := s.BeforePayment(tx); e != nil {
				return e
			}
		}
		if s.RequireActivation {
			var snapshot *core.DistributionSnapshot
			var e error
			points := order.PointsUnits
			if goods != nil {
				snapshot, e = partners.PurchaseSnapshot(tx, user, fen)
			} else {
				snapshot, points, e = partners.Snapshot(tx, user, fen, settings.PointsPerYuan)
			}
			if e != nil {
				return e
			}
			if snapshot != nil {
				if len(pricingVersion) != 1 || pricingVersion[0] != snapshot.PricingVersion {
					return fmt.Errorf("%w: 兑换价格已更新，请刷新确认后重新提交", core.ErrConflict)
				}
			} else if len(pricingVersion) > 0 && pricingVersion[0] != "" {
				return fmt.Errorf("%w: 兑换价格已更新，请刷新确认后重新提交", core.ErrConflict)
			}
			order.Distribution = snapshot
			order.PointsUnits = points
		}
		var e error
		out, e = tx.Put("orders", core.Record{ID: id, Owner: user, Data: core.Data(order)}, 0)
		return e
	})
	return
}

type PaymentResult struct {
	Platform                                                    string
	Channel                                                     string
	OrderID, TransactionID, AppID, MerchantID, OpenID, Currency string
	AmountFen                                                   int64
	PaidAt                                                      time.Time
}

func (s *Service) Settle(ctx context.Context, p PaymentResult) error {
	row, err := s.Store.Get(ctx, "orders", p.OrderID)
	if err != nil {
		return err
	}
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, row.Owner); e != nil {
			return e
		}
		current, e := tx.Get("orders", row.ID)
		if e != nil {
			return e
		}
		var order core.Order
		if e = json.Unmarshal(current.Data, &order); e != nil {
			return e
		}
		channel := p.Channel
		if channel == "" {
			channel = "wechat_jsapi"
		}
		storedChannel := order.Channel
		if storedChannel == "" {
			storedChannel = "wechat_jsapi"
		}
		if channel != storedChannel {
			return core.ErrPaymentMismatch
		}
		if p.AppID != order.AppID || p.MerchantID != order.MerchantID || p.OpenID != order.OpenID || p.AmountFen != order.AmountFen || p.Currency != "CNY" || p.TransactionID == "" || len(p.TransactionID) > 64 {
			return core.ErrPaymentMismatch
		}
		if order.Status == "paid" || order.Status == "refunding" || order.Status == "refunded" {
			if order.TransactionID != p.TransactionID {
				return core.ErrPaymentMismatch
			}
			return nil
		}
		if order.Status != "created" && order.Status != "closed" {
			return core.ErrConflict
		}
		if other, e := tx.Get("payment_transactions", p.TransactionID); e == nil {
			if string(other.Data) != string(core.Data(p.OrderID)) {
				return core.ErrPaymentMismatch
			}
		} else if errors.Is(e, core.ErrNotFound) {
			if _, e = tx.Put("payment_transactions", core.Record{ID: p.TransactionID, Owner: order.UserID, Data: core.Data(p.OrderID)}, 0); e != nil {
				return e
			}
		} else {
			return e
		}
		if _, e = store.ApplyFunds(tx, core.LedgerEntry{UserID: order.UserID, Reference: "recharge:" + row.ID, Kind: "topup", AvailableDelta: order.PointsUnits, Note: "微信支付充值积分"}); e != nil {
			return e
		}
		if e = partners.CreditCommission(tx, row.ID, order); e != nil {
			return e
		}
		order.Status = "paid"
		if order.Virtual != nil {
			order.Virtual.Platform = p.Platform
			// A durable outbox survives failures between crediting and notifying WeChat.
			if _, e = tx.Put("virtual_deliveries", core.Record{ID: row.ID, Owner: row.Owner, Data: core.Data(map[string]string{"status": "pending"})}, 0); e != nil {
				return e
			}
		}
		order.TransactionID = p.TransactionID
		order.PaidAt = &p.PaidAt
		current.Data = core.Data(order)
		if _, e = tx.Put("orders", current, current.Version); e != nil {
			return e
		}
		return store.NotifyOnce(tx, order.UserID, "recharge:"+row.ID, core.Notification{Kind: "order", Title: "积分已到账", Content: fmt.Sprintf("已到账 %.2f 积分。", float64(order.PointsUnits)/100), TargetID: row.ID})
	})
}
