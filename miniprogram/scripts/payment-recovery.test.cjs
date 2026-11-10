const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture() {
  const timers = [];
  const h = harness({ setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} });
  await h.api.signIn();
  h.storage.set("pending-payments", [{ id: "old-order", owner: "wx-user" }]);
  h.storage.set("pending-recharge", { id: "old-order", key: "old-key" });
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  const info = {
    wallet: { userId: "wx-user", availableUnits: 0, heldUnits: 0 },
    paymentReady: true, iosPayment: false,
    settings: { rechargeEnabled: true, pointsPerYuan: 100, minRechargeFen: 100, maxRechargeFen: 100000 },
    pricing: { ready: true, retailPer100Fen: 10000 },
  };
  const row = { id: "old-order", data: {
    userId: "wx-user", status: "created", amountFen: 100, pointsUnits: 10000,
    expiresAt: new Date(Date.now() + 60000).toISOString(), virtual: { issued: true },
  } };
  h.wx.request = o => {
    const url = o.url.split("/api")[1].split("?")[0];
    const data = url === "/wallet" ? info : url === "/wallet/ledger" ? [] : url === "/orders" ? [row] : url.endsWith("/refresh") ? {} : row;
    o.success({ statusCode: 200, data: JSON.parse(JSON.stringify(data)) });
  };
  const page = h.page("wallet");
  page.visible = true;
  await page.load();
  return { h, page, timers, row };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("payment timeout exposes recovery without dropping order or crediting points", async () => {
  const f = await fixture();
  for (let i = 0; i < 12; i++) {
    assert.ok(f.timers.length);
    f.timers.shift()();
    await flush();
  }
  assert.equal(f.page.data.paymentWaiting, true);
  assert.equal(f.page.data.pendingOrderId, "old-order");
  assert.equal(f.page.data.available, "0");
  await f.page.load();
  assert.equal(f.page.data.paymentWaiting, true, "balance refresh must not hide recovery");
  f.h.wx.showModal = o => o.success({ confirm: false });
  await f.page.additionalPurchase();
  assert.equal(f.page.data.pendingOrderId, "old-order");
  f.h.wx.showModal = o => o.success({ confirm: true });
  await f.page.additionalPurchase();
  assert.equal(f.page.data.pendingOrderId, "");
  assert.equal(f.h.storage.get("pending-payments")[0].deferred, true);
  assert.equal(f.h.storage.has("pending-recharge"), false);
  await f.page.load();
  assert.equal(f.page.data.pendingOrderId, "");
  const orders = f.h.page("orders");
  await orders.load();
  assert.equal(orders.data.rows[0].state, "确认到账中");
  assert.equal(orders.data.rows[0].canPay, false);
});

test("changing session while recovery confirmation is open cannot release another session lock", async () => {
  const f = await fixture();
  f.page.setData({ paymentWaiting: true });
  f.h.wx.showModal = o => {
    f.h.storage.delete("douboSession");
    o.success({ confirm: true });
  };
  await f.page.additionalPurchase();
  assert.equal(f.h.storage.get("pending-payments")[0].deferred, undefined);
  assert.equal(f.page.data.pendingOrderId, "old-order");
});

test("cancelled issued virtual order explains why checkout cannot reopen", async () => {
  const f = await fixture();
  f.h.storage.delete("pending-payments");
  const orders = f.h.page("orders");
  await orders.load();
  assert.equal(orders.data.rows[0].state, "需核对支付结果");
  assert.equal(orders.data.rows[0].canPay, false);
});
