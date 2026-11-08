package virtualpay

import (
	"doubo/server/internal/core"
	"fmt"
)

const MaxAmountFen = core.MaxOrderAmountFen

// Purchase freezes unit price, quantity and total credit before signing a payment.
func (p Product) Purchase(quantity int64, env int, platform, mode string) (core.VirtualOrder, int64, error) {
	if quantity < 1 || p.AmountFen < 1 || quantity > MaxAmountFen/p.AmountFen ||
		p.PointsUnits < 1 || quantity > core.MaxBalance/p.PointsUnits {
		return core.VirtualOrder{}, 0, fmt.Errorf("充值数量或金额超出允许范围")
	}
	return core.VirtualOrder{ProductID: p.ID, ProductName: p.Name,
		Quantity: quantity, UnitFen: p.AmountFen, PointsUnits: p.PointsUnits * quantity,
		Env: env, Platform: platform, PurchaseMode: mode}, p.AmountFen * quantity, nil
}

// Orders created before quantity support represent one item at the order price.
func PurchaseDetails(o core.Order) (quantity, unitFen int64, err error) {
	if o.Virtual == nil {
		return 0, 0, core.ErrPaymentMismatch
	}
	return o.Virtual.PurchaseDetails(o.AmountFen)
}

func validateSnapshot(o core.Order) error {
	if _, _, err := PurchaseDetails(o); err != nil {
		return err
	}
	if o.PointsUnits < 1 || o.PointsUnits > core.MaxBalance || o.Virtual.PointsUnits != o.PointsUnits {
		return core.ErrPaymentMismatch
	}
	return nil
}

func (p Product) Matches(o core.Order) bool {
	quantity, unitFen, err := PurchaseDetails(o)
	return err == nil && p.AmountFen == unitFen && p.PointsUnits > 0 &&
		quantity <= core.MaxBalance/p.PointsUnits && p.PointsUnits*quantity == o.PointsUnits &&
		o.Virtual.PointsUnits == o.PointsUnits
}

type CustomPurchase struct {
	ProductID       string `json:"productId"`
	UnitAmountFen   int64  `json:"unitAmountFen"`
	UnitPointsUnits int64  `json:"unitPointsUnits"`
	MinAmountFen    int64  `json:"minAmountFen"`
	MaxAmountFen    int64  `json:"maxAmountFen"`
}

func (c Config) CustomPurchase(settings core.PlatformSettings, retail int64) *CustomPurchase {
	p, ok := c.Product(c.CustomProductID)
	if !ok || retail <= 0 || p.AmountFen < 1 || p.AmountFen > MaxAmountFen ||
		settings.PointsPerYuan < 1 || settings.PointsPerYuan > 100000 {
		return nil
	}
	// Unit conversion must be exact: rounding once per item would under-credit bulk orders.
	numerator := p.AmountFen * settings.PointsPerYuan * 10000
	if numerator%retail != 0 || numerator/retail != p.PointsUnits {
		return nil
	}
	minimum := ((settings.MinRechargeFen-1)/p.AmountFen + 1) * p.AmountFen
	maximum := settings.MaxRechargeFen / p.AmountFen * p.AmountFen
	if maximum/p.AmountFen > core.MaxBalance/p.PointsUnits {
		maximum = core.MaxBalance / p.PointsUnits * p.AmountFen
	}
	if minimum > maximum {
		return nil
	}
	return &CustomPurchase{p.ID, p.AmountFen, p.PointsUnits, minimum, maximum}
}
