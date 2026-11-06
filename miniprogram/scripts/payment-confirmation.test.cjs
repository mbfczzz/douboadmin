const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture() {
  const timers = new Map();
  let timerID = 0;
  const h = harness({
    setTimeout(fn) {
      const id = ++timerID;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  await h.api.signIn();
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  const info = {
    wallet: { userId: "wx-user", availableUnits: 0, heldUnits: 0 },
    settings: {
      rechargeEnabled: true,
      pointsPerYuan: 100,
      minRechargeFen: 100,
      maxRechargeFen: 100000,
    },
    settingsVersion: 1,
    paymentReady: true,
  };
  const order = {
    id: "pending-order",
    owner: "wx-user",
    data: {
      userId: "wx-user",
      status: "created",
      amountFen: 1000,
      pointsUnits: 100000,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  };
  let payments = 0,
    creates = 0,
    afterPayment = false,
    unavailable = false;
  h.wx.requestPayment = (options) => {
    payments++;
    afterPayment = true;
    options.success();
  };
  h.wx.request = (options) => {
    const route = new URL(options.url).pathname.replace("/api", "");
    if (unavailable && afterPayment && route.startsWith("/orders/")) {
      options.fail();
      return;
    }
    let data;
    if (route === "/wallet") data = info;
    else if (route === "/wallet/ledger") data = [];
    else if (route === "/orders" && options.method === "POST") {
      creates++;
      data = order;
    } else if (route.endsWith("/pay")) data = {};
    else if (route.startsWith("/orders/")) data = order;
    else throw new Error("Unexpected request: " + route);
    options.success({
      statusCode: 200,
      data: JSON.parse(JSON.stringify(data)),
    });
  };
  const page = h.page("wallet");
  page.visible = true;
  await page.load();
  async function tick() {
    const first = timers.entries().next().value;
    assert.ok(first, "expected an active confirmation timer");
    timers.delete(first[0]);
    first[1]();
    await new Promise(setImmediate);
    await new Promise(setImmediate);
  }
  return {
    h,
    page,
    info,
    order,
    timers,
    tick,
    offline: () => {
      unavailable = true;
    },
    counts: () => ({ payments, creates }),
  };
}

test("native success waits for server credit then automatically refreshes the visible wallet", async () => {
  const f = await fixture();
  await f.page.pay();
  assert.equal(f.page.data.available, "0");
  assert.equal(f.page.data.pendingOrderId, f.order.id);
  assert.match(f.page.data.paymentNotice, /确认/);
  await f.page.pay();
  assert.deepEqual(f.counts(), { payments: 1, creates: 1 });
  f.order.data.status = "paid";
  f.info.wallet.availableUnits = 100000;
  await f.tick();
  assert.equal(f.page.data.available, "1000");
  assert.equal(f.page.data.pendingOrderId, "");
  assert.equal(f.h.storage.has("pending-payment"), false);
  assert.equal(f.h.storage.has("pending-payments"), false);
  assert.equal(f.h.storage.has("pending-recharge"), false);
  assert.match(f.page.data.paymentNotice, /已到账/);
  f.page.onHide();
});

test("network failure after native payment keeps pending status without inventing credit", async () => {
  const f = await fixture();
  f.offline();
  await f.page.pay();
  assert.equal(f.page.data.pendingOrderId, f.order.id);
  assert.equal(f.page.data.available, "0");
  assert.match(f.page.data.paymentNotice, /确认/);
  assert.equal(f.h.storage.get("pending-payments")[0].id, f.order.id);
  f.page.onHide();
  assert.equal(f.timers.size, 0);
});

test("cancelling the payment sheet never reports paid or changes the wallet", async () => {
  const f = await fixture();
  f.h.wx.requestPayment = (options) =>
    options.fail({ errMsg: "requestPayment:fail cancel" });
  await f.page.pay();
  assert.equal(f.page.data.available, "0");
  assert.equal(f.page.data.pendingOrderId, "");
  assert.equal(f.h.storage.has("pending-payment"), false);
  assert.equal(f.h.storage.has("pending-payments"), false);
  assert.equal(f.h.storage.get("pending-recharge").id, f.order.id);
  f.page.onHide();
});

test("leaving a pending payment stops polling and returning resumes the same order", async () => {
  const f = await fixture();
  await f.page.pay();
  f.page.onHide();
  assert.equal(f.timers.size, 0);
  f.page.visible = true;
  await f.page.load();
  assert.equal(f.timers.size, 1);
  f.order.data.status = "paid";
  f.info.wallet.availableUnits = 100000;
  await f.tick();
  assert.equal(f.page.data.available, "1000");
  assert.deepEqual(f.counts(), { payments: 1, creates: 1 });
  f.page.onHide();
});

test("a different session cannot continue a pending payment poll", async () => {
  const f = await fixture();
  await f.page.pay();
  f.h.storage.set("douboSession", {
    token: "different-user",
    expiresAt: Date.now() + 100000,
  });
  let calls = 0;
  f.h.wx.request = () => calls++;
  await f.tick();
  assert.equal(calls, 0);
  assert.equal(f.timers.size, 0);
  f.page.onHide();
});

test("cancelling a new payment clears the preceding order's success notice", async () => {
  const f = await fixture();
  f.page.setData({ paymentNotice: "积分已到账" });
  f.page.input({ detail: { value: "20" } });
  assert.equal(f.page.data.paymentNotice, "");
  f.page.setData({ paymentNotice: "积分已到账" });
  f.h.wx.requestPayment = (options) => {
    assert.equal(f.page.data.paymentNotice, "");
    options.fail({ errMsg: "requestPayment:fail cancel" });
  };
  await f.page.pay();
  assert.match(f.page.data.paymentNotice, /已取消本次支付/);
  assert.doesNotMatch(f.page.data.paymentNotice, /已到账/);
  assert.equal(f.page.data.available, "0");
  f.page.onHide();
});

test("wallet refreshes a task release while visible and stops after the hold clears", async () => {
  const f = await fixture();
  f.info.wallet.availableUnits = 97500;
  f.info.wallet.heldUnits = 2500;
  await f.page.load();
  assert.equal(f.page.data.available, "975");
  assert.equal(f.page.data.held, "25");
  assert.equal(f.timers.size, 1);
  f.info.wallet.availableUnits = 100000;
  f.info.wallet.heldUnits = 0;
  await f.tick();
  assert.equal(f.page.data.available, "1000");
  assert.equal(f.page.data.held, "0");
  assert.equal(f.timers.size, 0);
  f.page.onHide();
});

test("hiding a wallet with held points cancels refresh; returning reads settlement", async () => {
  const f = await fixture();
  f.info.wallet.availableUnits = 97500;
  f.info.wallet.heldUnits = 2500;
  await f.page.load();
  f.page.onHide();
  assert.equal(f.timers.size, 0);
  f.info.wallet.heldUnits = 0;
  f.page.visible = true;
  await f.page.load();
  assert.equal(f.page.data.available, "975");
  assert.equal(f.page.data.held, "0");
  assert.equal(f.timers.size, 0);
  f.page.onHide();
});
