const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// Payment safety review (2026-11): logout keeps the per-user lock, one purchase
// at a time per session, an order signed once is not reported as submitted,
// a waiting order is re-checked on refresh, and expiry is the server's call.
const flush = () => new Promise((r) => setImmediate(r));
const realNow = Date.now.bind(Date);
const info = () => ({ paymentChannel: "wechat_virtual", paymentReady: true, iosPayment: false,
  wallet: { userId: "wx-user", availableUnits: 0, heldUnits: 0 },
  settings: { rechargeEnabled: true, pointsPerYuan: 100, minRechargeFen: 100, maxRechargeFen: 100000 },
  settingsVersion: 1, pricing: { ready: true, version: "v1", retailPer100Fen: 10000 },
  virtualProducts: [{ id: "sku-1", name: "积分", amountFen: 100, pointsUnits: 10000 }] });
const order = (id, now) => ({ id, createdAt: new Date(now).toISOString(), data: { userId: "wx-user", channel: "wechat_virtual",
  amountFen: 100, pointsUnits: 10000, status: "created", expiresAt: new Date(now + 1800000).toISOString(),
  virtual: { productId: "sku-1", productName: "积分", issued: false, purchaseMode: "package" } } });

// A server that creates a new order per POST /orders and signs each order once.
async function wallet(outcomes, timers, { losePay = false } = {}) {
  const h = harness(timers || { setTimeout: () => 1, clearTimeout() {} });
  await h.api.signIn();
  const toasts = [], native = [], calls = [], orders = new Map(), wal = info();
  h.wx.showToast = (o) => toasts.push(o.title);
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  h.wx.canIUse = () => true;
  h.wx.getStorageInfoSync = () => ({ keys: [...h.storage.keys()] });
  h.wx.login = (o) => o.success({ code: "pay-code" });
  h.wx.requestVirtualPayment = (o) => { native.push(o); outcomes.shift()(o); };
  let pays = 0;
  h.wx.request = (o) => {
    const p = new URL(o.url).pathname.replace("/api", "");
    calls.push(o.method + " " + p);
    const ok = (data, statusCode = 200) => o.success({ statusCode, data: JSON.parse(JSON.stringify(data)) });
    if (p === "/auth/logout") return ok({});
    if (p === "/wallet") return ok(wal);
    if (p === "/wallet/ledger") return ok([]);
    if (p === "/orders" && o.method === "POST") {
      const id = "o" + (orders.size + 1);
      orders.set(id, order(id, realNow()));
      return ok(orders.get(id), 201);
    }
    if (p === "/orders" && o.method === "GET") return ok({ items: [...orders.values()], page: 1, size: 20, total: orders.size });
    const [, , id, action] = p.split("/");
    const row = orders.get(id);
    if (action === "pay") {
      if (row.data.virtual.issued) return ok({ error: "支付单号已签发" }, 409);
      row.data.virtual.issued = true;
      if (losePay && ++pays === 1) return o.fail({ errMsg: "request:fail timeout" });
      return ok({ channel: "wechat_virtual", mode: "short_series_goods", signData: "{}", paySig: "s", signature: "u" });
    }
    if (action === "refresh") return ok(row);
    if (row) return ok(row);
    throw new Error("unexpected " + p);
  };
  const page = h.page("wallet");
  page.visible = true;
  await page.load();
  page.chooseProduct({ currentTarget: { dataset: { id: "sku-1" } } });
  return { h, page, wal, orders, toasts, native, calls };
}

test("logging out keeps the lock: the same account cannot buy again while an order is unconfirmed", async () => {
  const f = await wallet([(o) => o.fail({ errCode: -1, errMsg: "fail" }), (o) => o.success({})]);
  await f.page.pay();
  assert.equal(f.page.data.pendingOrderId, "o1");
  await f.h.api.logout();
  assert.ok(f.h.storage.get("pending-payments"), "lock kept on logout");
  f.h.storage.set("douboSession", { token: "t2", userId: "wx-user", provider: "wechat", expiresAt: realNow() + 86400000 });
  await f.page.load();
  assert.equal(f.page.data.pendingOrderId, "o1");
  await f.page.pay();
  assert.equal(f.native.length, 1, "no second payment sheet");
  assert.equal(f.orders.size, 1);
});

test("leaving the wallet mid-checkout and buying again starts no second order or sheet", async () => {
  const f = await wallet([(o) => o.success({}), (o) => o.success({})]);
  const logins = [];
  const again = { ...f.page, data: JSON.parse(JSON.stringify(f.page.data)), destroyed: false, visible: true,
    revision: 0, watching: "", checkoutToken: "", stopWatching: undefined };
  f.h.wx.login = (o) => logins.push(o.success);
  const first = f.page.pay();
  while (!logins.length) await flush();
  f.page.onUnload();
  await again.load();
  again.chooseProduct({ currentTarget: { dataset: { id: "sku-1" } } });
  await again.pay();
  logins.forEach((done) => done({ code: "c" }));
  await first;
  assert.equal(f.orders.size, 1);
  assert.equal(f.native.length, 1);
  assert.match(f.toasts.join(), /上一笔支付正在处理/);
});

test("a refresh while 到账待确认 re-checks the order and ends the wait once it is credited", async () => {
  const queue = [];
  const f = await wallet([(o) => o.fail({ errCode: -1, errMsg: "fail" })], { setTimeout: (fn) => queue.push(fn), clearTimeout() {} });
  await f.page.pay();
  for (let i = 0; i < 12 && queue.length; i++) { queue.shift()(); await flush(); await flush(); }
  assert.equal(f.page.data.paymentWaiting, true);
  f.orders.get("o1").data.status = "paid";
  f.wal.wallet.availableUnits = 10000;
  await f.page.load();
  await flush();
  assert.equal(f.page.data.pendingOrderId, "");
  assert.equal(f.page.data.paymentWaiting, false);
  assert.ok(!(f.h.storage.get("pending-payments") || []).some((r) => r.id === "o1"));
});

test("a phone clock running fast does not make a fresh order look expired", async () => {
  const f = await wallet([(o) => o.success({})]);
  Date.now = () => realNow() + 31 * 60000;
  try {
    await f.page.pay();
  } finally {
    Date.now = realNow;
  }
  assert.equal(f.orders.size, 1);
  assert.equal(f.calls.filter((c) => c.endsWith("/pay")).length, 1);
  assert.equal(f.native.length, 1);
});

test("an order signed once is not reported as submitted and does not lock the wallet", async () => {
  const f = await wallet([], undefined, { losePay: true });
  await f.page.pay(); // order o1 signed, response lost: no sheet
  assert.equal(f.native.length, 0);
  const orders = f.h.page("orders");
  orders.visible = true;
  await orders.load();
  assert.equal(orders.data.rows[0].canPay, false, "signed order offers no 继续支付");
  // A stale button for it (list not reloaded) is refused plainly, not "已提交".
  const errors = [];
  f.h.wx.showModal = (o) => errors.push(o.content);
  await orders.pay({ currentTarget: { dataset: { id: "o1" } } });
  assert.equal(f.native.length, 0);
  assert.ok(!f.toasts.some((t) => /支付已提交/.test(t)));
  assert.ok(!(f.h.storage.get("pending-payments") || []).some((r) => r.id === "o1"), "wallet not locked");
});
