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

func TestCustomPurchaseRequiresExactUnitConversion(t *testing.T) {
	c := testConfig()
	c.CustomProductID = c.Products[0].ID
	s := core.DefaultPlatform()
	if custom := c.CustomPurchase(s, 10000); custom == nil || custom.MinAmountFen != 100 || custom.MaxAmountFen != 100000 {
		t.Fatal(custom)
	}
	c.Products[0].AmountFen, c.Products[0].PointsUnits = 10, 1000
	if custom := c.CustomPurchase(s, 10000); custom == nil || custom.MinAmountFen != 100 {
		t.Fatal("unit below minimum cannot support a valid larger order", custom)
	}
	c.Products[0].PointsUnits = 909
	if custom := c.CustomPurchase(s, 11000); custom != nil {
		t.Fatal("repeated rounding would under-credit a multi-item order", custom)
	}
	c.Products[0].PointsUnits = 999
	if custom := c.CustomPurchase(s, 10000); custom != nil {
		t.Fatal("a mismatched unit rate was advertised", custom)
	}
	c.CustomProductID = "missing"
	if c.Validate() == nil {
		t.Fatal("missing custom base product accepted")
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
