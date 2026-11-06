const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture(outcome = "success") {
  const h = harness({ setTimeout: () => 1, clearTimeout() {} });
  await h.api.signIn();
  const calls = [],
    native = [];
  const info = {
    paymentChannel: "wechat_virtual",
    paymentReady: true,
    iosPayment: false,
    wallet: { userId: "wx-user", availableUnits: 0, heldUnits: 0 },
    settings: {
      rechargeEnabled: true,
      pointsPerYuan: 100,
      minRechargeFen: 100,
      maxRechargeFen: 100000,
    },
    settingsVersion: 1,
    pricing: { ready: true, version: "v1", retailPer100Fen: 10000 },
    virtualProducts: [
      { id: "sku-1", name: "积分商品", amountFen: 100, pointsUnits: 10000 },
    ],
  };
  const row = {
    id: "order-virtual",
    data: {
      userId: "wx-user",
      channel: "wechat_virtual",
      amountFen: 100,
      pointsUnits: 10000,
      status: "created",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      virtual: { productId: "sku-1", issued: false },
    },
  };
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  h.wx.canIUse = () => true;
  h.wx.login = (options) => options.success({ code: "fresh-payment-code" });
  h.wx.requestPayment = () => {
    throw Error("ordinary payment must not run");
  };
  const signed = '{"offerId":"fixture", "productId":"sku-1"}';
  h.wx.requestVirtualPayment = (params) => {
    native.push(params);
    if (outcome === "success") params.success({ errMsg: "ok" });
    else if (outcome === "cancel")
      params.fail({ errCode: -2, errMsg: "cancel" });
    else params.fail({ errCode: -1, errMsg: "unknown" });
  };
  h.wx.request = (options) => {
    const url = options.url.split("/api")[1];
    calls.push({ path: url, data: options.data });
    let data;
    if (url === "/wallet") data = info;
    else if (url === "/wallet/ledger") data = [];
    else if (url === "/orders" || url === "/orders/order-virtual") data = row;
    else if (url === "/orders/order-virtual/pay") {
      row.data.virtual.issued = true;
      data = {
        channel: "wechat_virtual",
        mode: "short_series_goods",
        signData: signed,
        paySig: "fixture-sig",
        signature: "fixture-user-sig",
      };
    } else if (url.endsWith("/refresh")) data = {};
    else throw Error("Unexpected request " + url);
    options.success({
      statusCode: 200,
      data: JSON.parse(JSON.stringify(data)),
    });
  };
  const page = h.page("wallet");
  await page.load();
  page.chooseProduct({ currentTarget: { dataset: { id: "sku-1" } } });
  return { h, page, info, row, calls, native, signed };
}

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
