const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./virtual-payment-fixture.cjs");

test("iOS can request payment for a 0.10 yuan package", async () => {
  const f = await fixture();
  f.info.iosPayment = true;
  f.info.virtualProducts[0].amountFen = f.row.data.amountFen = 10;
  f.h.wx.getDeviceInfo = () => ({ platform: "ios", system: "iOS 16.0" });
  f.h.wx.getAppBaseInfo = () => ({ version: "8.0.68" });
  await f.page.load();
  await f.page.pay();
  const created = f.calls.find(c => c.path === "/orders");
  assert.equal(created.data.amountFen, 10);
  assert.equal(created.data.platform, "ios");
  assert.equal(f.native.length, 1);
  assert.equal(f.native[0].signData, f.signed);
});

test("a 0.1 yuan SKU uses its own credit despite retired recharge limits and switches", async () => {
  const f = await fixture();
  f.info.settings = { rechargeEnabled: false, pointsPerYuan: 0, minRechargeFen: 100000, maxRechargeFen: 1 };
  f.info.virtualProducts[0].amountFen = 10;
  f.info.virtualProducts[0].pointsUnits = 1000000;
  f.row.data.amountFen = 10;
  f.row.data.pointsUnits = 1000000;
  await f.page.load();
  await f.page.pay();
  assert.equal(f.native.length, 1);
  assert.equal(f.calls.find((c) => c.path === "/orders").data.amountFen, 10);
  assert.equal(f.page.data.available, "0");
});

test("virtual checkout sends product identity and untouched dual signatures, never credits from client success", async () => {
  const f = await fixture();
  await f.page.pay();
  assert.equal(f.native.length, 1);
  assert.equal(f.native[0].signData, f.signed);
  assert.equal(
    f.calls.find((c) => c.path.endsWith("/pay")).data.code,
    "fresh-payment-code",
  );
  assert.equal(
    f.calls.find((c) => c.path === "/orders").data.productId,
    "sku-1",
  );
  assert.equal(f.page.data.available, "0");
  assert.match(f.page.data.paymentNotice, /确认/);
});

test("virtual cancellation is not successful payment and permits choosing a fresh order", async () => {
  const f = await fixture("cancel");
  await f.page.pay();
  assert.match(f.page.data.paymentNotice, /取消/);
  assert.equal(f.h.wx.getStorageSync("pending-payments") || "", "");
  assert.equal(f.page.data.available, "0");
});

test("unknown native failure stays pending and cannot open a second checkout", async () => {
  const f = await fixture("unknown");
  await f.page.pay();
  await f.page.pay();
  assert.equal(f.native.length, 1);
  assert.match(f.page.data.paymentNotice, /确认/);
});

test("unsupported devices and empty catalogs cannot create a virtual order", async () => {
  const f = await fixture();
  f.h.wx.requestVirtualPayment = undefined;
  await f.page.pay();
  assert.equal(f.calls.filter((c) => c.path === "/orders").length, 0);
  f.page.setData({ productId: "", products: [] });
  await f.page.pay();
  assert.equal(f.native.length, 0);
});

test("catalog refresh clears a removed selection instead of silently substituting another item", async () => {
  const f = await fixture();
  f.info.virtualProducts = [];
  await f.page.load();
  assert.equal(f.page.data.productId, "");
  assert.equal(f.page.data.amount, "");
  await f.page.pay();
  assert.equal(f.native.length, 0);
});

test("iOS virtual checkout requires both the backend switch and supported client versions", async () => {
  const f = await fixture();
  f.info.iosPayment = true;
  f.h.wx.getDeviceInfo = () => ({ platform: "ios", system: "iOS 14.8" });
  f.h.wx.getAppBaseInfo = () => ({ version: "8.0.68" });
  await f.page.load();
  await f.page.pay();
  assert.equal(f.native.length, 0);
  f.h.wx.getDeviceInfo = () => ({ platform: "ios", system: "iOS 16.0" });
  f.h.wx.getAppBaseInfo = () => ({ version: "8.0.67" });
  await f.page.pay();
  assert.equal(f.native.length, 0);
  f.h.wx.getAppBaseInfo = () => ({ version: "8.0.68" });
  await f.page.pay();
  assert.equal(f.native.length, 1);
});
