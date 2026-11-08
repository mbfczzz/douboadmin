package api

import "doubo/server/internal/virtualpay"

type virtualCheckout struct {
	ProductID           string `json:"productId"`
	PurchaseMode        string `json:"purchaseMode"`
	AmountFen           int64  `json:"amountFen"`
	ExpectedPointsUnits *int64 `json:"expectedPointsUnits"`
	SettingsVersion     int64  `json:"settingsVersion"`
	PricingVersion      string `json:"pricingVersion"`
	Platform            string `json:"platform"`
}

func (a *Server) virtualCustom() *virtualpay.CustomPurchase {
	if !a.Virtual.Enabled() {
		return nil
	}
	return a.Virtual.Client.Config.CustomPurchase()
}
