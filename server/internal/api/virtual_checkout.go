package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
)

type virtualCheckout struct {
	ProductID       string `json:"productId"`
	PurchaseMode    string `json:"purchaseMode"`
	AmountFen       int64  `json:"amountFen"`
	SettingsVersion int64  `json:"settingsVersion"`
	PricingVersion  string `json:"pricingVersion"`
	Platform        string `json:"platform"`
}

func (a *Server) virtualCustom(settings core.PlatformSettings, retail int64) *virtualpay.CustomPurchase {
	if !a.Virtual.Enabled() {
		return nil
	}
	return a.Virtual.Client.Config.CustomPurchase(settings, retail)
}

func (a *Server) customForUser(ctx context.Context, user string, settings core.PlatformSettings) (*virtualpay.CustomPurchase, error) {
	retail := int64(10000)
	if a.Config.RequireActivation {
		snapshot, _, err := a.Partners.UserQuote(ctx, user, 100, settings.PointsPerYuan)
		if err != nil {
			return nil, err
		}
		if snapshot != nil {
			retail = snapshot.RetailPer100Fen
		}
	}
	return a.virtualCustom(settings, retail), nil
}
