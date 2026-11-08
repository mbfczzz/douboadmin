const { harness } = require("./harness.cjs");

async function fixture(outcome = "success") {
  const h = harness({ setTimeout: () => 1, clearTimeout() {} });
  await h.api.signIn();
  const calls = [],
    native = [],
    messages = [];
  h.wx.showToast = (o) => messages.push(o.title);
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
  return { h, page, info, row, calls, native, signed, messages };
}

module.exports = { fixture };
