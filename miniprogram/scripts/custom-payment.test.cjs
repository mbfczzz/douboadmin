const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./virtual-payment-fixture.cjs");
const mode = (value) => ({ currentTarget: { dataset: { mode: value } } });
const input = (page, value) => page.input({ detail: { value } });

async function customFixture(outcome) {
  const f = await fixture(outcome);
  Object.assign(f.info.virtualProducts[0], {
    amountFen: 10,
    pointsUnits: 1000,
  });
  f.info.virtualCustom = {
    productId: "sku-1",
    unitAmountFen: 10,
    unitPointsUnits: 1000,
    minAmountFen: 100,
    maxAmountFen: 100000,
  };
  await f.page.load();
  f.page.choosePurchase(mode("custom"));
  return f;
}

test("custom checkout submits the requested money and uses untouched server signatures", async () => {
  const f = await customFixture();
  assert.equal(f.page.data.purchaseMode, "custom");
  input(f.page, "1.00");
  assert.equal(f.page.data.estimated, "100");
  assert.equal(f.page.data.checkoutError, "");
  await f.page.pay();
  const order = f.calls.find((c) => c.path === "/orders");
  assert.equal(order.data.purchaseMode, "custom");
  assert.equal(order.data.amountFen, 100);
  assert.equal(order.data.productId, "sku-1");
  assert.equal(
    order.data.quantity,
    undefined,
    "quantity must be derived by the server",
  );
  assert.equal(f.native.length, 1);
  assert.equal(f.native[0].signData, f.signed);
  assert.equal(
    f.page.data.available,
    "0",
    "native success cannot issue points locally",
  );
});

test("switching purchase modes preserves the custom draft and restores the selected package", async () => {
  const f = await customFixture();
  input(f.page, "1.50");
  assert.equal(f.page.data.estimated, "150");
  f.page.choosePurchase(mode("package"));
  assert.equal(f.page.data.amount, "0.10");
  assert.equal(f.page.data.estimated, "10");
  f.page.choosePurchase(mode("custom"));
  assert.equal(f.page.data.amount, "1.50");
  assert.equal(f.page.data.estimated, "150");
});

for (const [amount, message] of [
  ["", /请输入/],
  ["0.10", /请输入/],
  ["1.03", /整数倍/],
  ["1000.10", /请输入/],
  ["1.001", /请输入/],
  ["not-money", /请输入/],
]) {
  test(`invalid custom amount ${JSON.stringify(amount)} cannot create an order`, async () => {
    const f = await customFixture();
    input(f.page, amount);
    assert.equal(f.page.data.estimated, "—");
    await f.page.pay();
    assert.equal(f.calls.filter((c) => c.path === "/orders").length, 0);
    assert.equal(f.native.length, 0);
    assert.match(f.messages.at(-1), message);
  });
}

test("custom checkout cannot switch modes or amounts while payment confirmation is pending", async () => {
  const f = await customFixture("unknown");
  input(f.page, "1.00");
  await f.page.pay();
  assert.equal(f.page.data.pendingOrderId, "order-virtual");
  f.page.choosePurchase(mode("package"));
  input(f.page, "2.00");
  await f.page.pay();
  assert.equal(f.page.data.purchaseMode, "custom");
  assert.equal(f.page.data.amount, "1.00");
  assert.equal(f.native.length, 1);
});

test("removed custom configuration keeps the entered amount and requires an explicit package choice", async () => {
  const f = await customFixture();
  input(f.page, "1.00");
  f.info.virtualCustom = null;
  await f.page.load();
  assert.equal(f.page.data.purchaseMode, "custom");
  assert.equal(f.page.data.amount, "1.00");
  assert.equal(f.page.data.estimated, "—");
  assert.match(f.page.data.checkoutError, /暂不可用/);
  await f.page.pay();
  assert.equal(f.native.length, 0);
  f.page.choosePurchase(mode("package"));
  assert.equal(f.page.data.estimated, "10");
});

test("iOS unit prices below 0.10 yuan are rejected even when the total exceeds the floor", async () => {
  const f = await customFixture();
  f.info.virtualCustom.unitAmountFen = 5;
  f.info.iosPayment = true;
  f.h.wx.getDeviceInfo = () => ({ platform: "ios", system: "iOS 16.0" });
  f.h.wx.getAppBaseInfo = () => ({ version: "8.0.68" });
  await f.page.load();
  input(f.page, "1.00");
  await f.page.pay();
  assert.match(f.messages.at(-1), /当前设备/);
  assert.equal(f.calls.filter((c) => c.path === "/orders").length, 0);
});

test("iOS accepts a 0.10 yuan unit and total for custom checkout", async () => {
  const f = await customFixture();
  f.row.data.amountFen = 10;
  f.row.data.pointsUnits = 1000;
  f.info.virtualCustom.minAmountFen = 10;
  f.info.iosPayment = true;
  f.h.wx.getDeviceInfo = () => ({ platform: "ios", system: "iOS 16.0" });
  f.h.wx.getAppBaseInfo = () => ({ version: "8.0.68" });
  await f.page.load();
  input(f.page, "0.10");
  assert.equal(f.page.data.checkoutError, "");
  await f.page.pay();
  const order = f.calls.find((c) => c.path === "/orders");
  assert.equal(order.data.amountFen, 10);
  assert.equal(order.data.platform, "ios");
  assert.equal(f.native.length, 1);
});

test("a price-version conflict refreshes the quote without automatically charging again", async () => {
  const f = await customFixture();
  input(f.page, "1.00");
  const original = f.h.wx.request;
  f.h.wx.request = (o) => {
    if (o.url.endsWith("/orders")) {
      f.calls.push({ path: "/orders", data: o.data });
      return o.success({ statusCode: 409, data: { error: "兑换价格已更新" } });
    }
    return original(o);
  };
  await f.page.pay();
  assert.equal(f.page.data.busy, false);
  assert.equal(f.page.data.amount, "1.00");
  assert.equal(f.calls.filter((c) => c.path === "/orders").length, 1);
  assert.equal(f.native.length, 0);
});
