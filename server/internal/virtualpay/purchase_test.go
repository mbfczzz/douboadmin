package virtualpay

import (
	"doubo/server/internal/core"
	"math"
	"testing"
)

func TestPurchaseAmountAndPointOverflowAreRejected(t *testing.T) {
	p := Product{ID: "base", Name: "积分", AmountFen: 10, PointsUnits: 1000}
	for _, quantity := range []int64{0, -1, math.MaxInt64, MaxAmountFen/10 + 1} {
		if _, _, err := p.Purchase(quantity, 0, "android", "custom"); err == nil {
			t.Fatal("invalid quantity accepted", quantity)
		}
	}
	p.PointsUnits = core.MaxBalance
	if _, _, err := p.Purchase(2, 0, "android", "custom"); err == nil {
		t.Fatal("point overflow accepted")
	}
}

func TestCustomPurchaseUsesSKUPriceAndCreditWithoutLegacyRules(t *testing.T) {
	c := testConfig()
	c.CustomProductID = c.Products[0].ID
	c.Products[0].AmountFen, c.Products[0].PointsUnits = 10, 1000000
	custom := c.CustomPurchase()
	if custom == nil || custom.MinAmountFen != 10 || custom.UnitPointsUnits != 1000000 || custom.MaxAmountFen != MaxAmountFen {
		t.Fatal(custom)
	}
	c.Products[0].PointsUnits = core.MaxBalance
	if custom = c.CustomPurchase(); custom == nil || custom.MaxAmountFen != 10 {
		t.Fatal(custom)
	}
	c.CustomProductID = "missing"
	if c.CustomPurchase() != nil || c.Validate() == nil {
		t.Fatal("missing base SKU accepted")
	}
}

func TestLegacyAndMalformedPurchaseSnapshots(t *testing.T) {
	o := core.Order{AmountFen: 100, Virtual: &core.VirtualOrder{ProductID: "legacy"}}
	q, unit, err := PurchaseDetails(o)
	if err != nil || q != 1 || unit != 100 {
		t.Fatal(q, unit, err)
	}
	for _, data := range []core.VirtualOrder{
		{Quantity: -1}, {Quantity: 2}, {Quantity: 2, UnitFen: 60}, {Quantity: math.MaxInt64, UnitFen: 100},
	} {
		o.Virtual = &data
		if _, _, err = PurchaseDetails(o); err == nil {
			t.Fatal("invalid price/quantity snapshot accepted", data)
		}
	}
}
