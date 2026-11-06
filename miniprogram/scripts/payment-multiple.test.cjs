const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture() {
  const timers = new Map(),
    queries = [];
  let serial = 0,
    payments = 0;
  const h = harness({
    setTimeout(fn) {
      const id = ++serial;
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
    settings: { rechargeEnabled: true },
    paymentReady: true,
  };
  const rows = ["A", "B"].map((id) => ({
    id,
    owner: "wx-user",
    createdAt: new Date().toISOString(),
    data: {
      userId: "wx-user",
      status: "created",
      amountFen: 1000,
      pointsUnits: 100000,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  }));
  h.wx.requestPayment = (options) => {
    payments++;
    options.success();
  };
  h.wx.request = (options) => {
    const route = new URL(options.url).pathname.replace("/api", "");
    queries.push(route);
    let data;
    if (route === "/wallet") data = info;
    else if (route === "/orders") data = rows;
    else if (route.endsWith("/pay")) data = {};
    else if (route.startsWith("/orders/"))
      data = rows.find((row) => row.id === route.split("/")[2]);
    else throw new Error("Unexpected route: " + route);
    assert.ok(data);
    options.success({
      statusCode: 200,
      data: JSON.parse(JSON.stringify(data)),
    });
  };
  h.storage.set("pending-payment", { id: "A", owner: "wx-user" });
  const page = h.page("orders");
  page.visible = true;
  await page.load();
  async function tick() {
    for (const [id, callback] of [...timers]) {
      if (!timers.delete(id)) continue;
      callback();
    }
    await new Promise(setImmediate);
    await new Promise(setImmediate);
  }
  const pendingIDs = () =>
    (h.storage.get("pending-payments") || []).map((row) => row.id).sort();
  return {
    h,
    page,
    rows,
    info,
    timers,
    queries,
    tick,
    pendingIDs,
    payments: () => payments,
  };
}

test("paying B preserves pending A and migrates the legacy marker", async () => {
  const f = await fixture();
  await f.page.pay({ currentTarget: { dataset: { id: "B" } } });
  assert.deepEqual(Array.from(f.pendingIDs()), ["A", "B"]);
  assert.equal(f.h.storage.has("pending-payment"), false);
  assert.equal(f.payments(), 1);
  for (const row of f.page.data.rows) {
    assert.equal(row.state, "确认到账中");
    assert.equal(row.canPay, false);
  }
  assert.equal(f.timers.size, 2);
  f.h.storage.set("pending-recharge", { id: "B", key: "keep-B" });
  f.rows[0].data.status = "paid";
  await f.tick();
  assert.deepEqual(Array.from(f.pendingIDs()), ["B"]);
  assert.equal(f.h.storage.get("pending-recharge").id, "B");
  assert.equal(f.page.data.rows.find((row) => row.id === "A").state, "已支付");
  assert.equal(
    f.page.data.rows.find((row) => row.id === "B").state,
    "确认到账中",
  );
  f.rows[1].data.status = "paid";
  await f.tick();
  assert.deepEqual(Array.from(f.pendingIDs()), []);
  assert.equal(f.h.storage.has("pending-recharge"), false);
  assert.equal(f.timers.size, 0);
  f.page.onHide();
});

test("a pending order is not paid again or forgotten when its local expiry passes", async () => {
  const f = await fixture();
  f.rows[0].data.expiresAt = new Date(Date.now() - 1000).toISOString();
  await f.page.pay({ currentTarget: { dataset: { id: "A" } } });
  assert.equal(f.payments(), 0);
  assert.equal(f.h.storage.get("pending-payment").id, "A");
  assert.equal(
    f.page.data.rows.find((row) => row.id === "A").state,
    "确认到账中",
  );
  f.page.onHide();
  assert.equal(f.timers.size, 0);
  f.page.visible = true;
  await f.page.load();
  assert.equal(f.timers.size, 1);
  f.rows[0].data.status = "paid";
  await f.tick();
  assert.equal(f.h.storage.has("pending-payment"), false);
  assert.equal(f.h.storage.has("pending-payments"), false);
  f.page.onHide();
});

test("manual confirmation clears only that order and leaves another account's state untouched", async () => {
  const f = await fixture();
  f.h.storage.set("pending-payments", [
    { id: "B", owner: "wx-user" },
    { id: "other-order", owner: "other-user" },
  ]);
  await f.page.load();
  f.rows[0].data.status = "paid";
  await f.page.refresh({ currentTarget: { dataset: { id: "A" } } });
  assert.deepEqual(Array.from(f.pendingIDs()), ["B", "other-order"]);
  f.rows[1].data.status = "refunded";
  await f.tick();
  assert.deepEqual(Array.from(f.pendingIDs()), ["other-order"]);
  assert.equal(f.page.data.rows.find((row) => row.id === "B").state, "已退款");
  assert.ok(f.queries.every((route) => !route.includes("other-order")));
  f.page.onHide();
});
