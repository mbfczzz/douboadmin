const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// retailPer100Fen is a price index (10000 = standard); the shown price of
// 100 points must follow the 积分/元 ratio (1 元 = 10 积分 → ¥10.00).
test("current price per 100 points follows points-per-yuan and the provider index", async () => {
  for (const [ratio, index, shown] of [[10, 10000, "10.00"], [100, 10000, "1.00"], [10, 12000, "12.00"]]) {
    const h = harness({ setTimeout: () => 1, clearTimeout() {} });
    await h.api.signIn();
    h.wx.getDeviceInfo = () => ({ platform: "android" });
    h.wx.request = (o) => {
      const path = new URL(o.url).pathname;
      o.success({ statusCode: 200, data: path === "/api/wallet"
        ? { wallet: { userId: "wx-user", availableUnits: 0, heldUnits: 0 }, settings: { rechargeEnabled: false, pointsPerYuan: ratio },
            pricing: { ready: true, retailPer100Fen: index } }
        : { items: [], page: 1, size: 20, total: 0 } });
    };
    const page = h.page("wallet");
    page.onLoad?.({});
    await page.load();
    assert.equal(page.data.price100, shown, `ratio ${ratio}, index ${index}`);
  }
});

test("virtual payment prices 100 points from the packages, not the legacy ratio", () => {
  const { pricePer100 } = harness().service("../pages/wallet/insights");
  const base = { settings: { pointsPerYuan: 100 }, pricing: { retailPer100Fen: 10000 }, paymentChannel: "wechat_virtual" };
  // ¥1 → 10 积分 (1:10) is ¥10.00 per 100; a bonus package does not set the price.
  const products = [{ id: "a", amountFen: 100, pointsUnits: 1000 }, { id: "b", amountFen: 10000, pointsUnits: 120000 }];
  assert.equal(pricePer100({ ...base, virtualProducts: products }), "10.00");
  assert.equal(pricePer100({ ...base, virtualProducts: products, virtualCustom: { unitAmountFen: 100, unitPointsUnits: 1000 } }), "10.00");
  assert.equal(pricePer100({ ...base, virtualProducts: [] }), "");
});
