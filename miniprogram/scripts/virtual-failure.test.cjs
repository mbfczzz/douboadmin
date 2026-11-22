const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./virtual-payment-fixture.cjs");

for (const [code, reason] of [
  [1001, "参数校验"],
  [-15001, "参数校验"],
  [-15004, "币种"],
  [-15005, "登录签名"],
  [-15006, "支付签名"],
  [-15007, "已过期"],
  [-15008, "商户支付配置"],
  [-15009, "尚未发布"],
  [-15010, "套餐尚未发布"],
  [-15011, "环境配置"],
  [-15013, "价格"],
  [-15014, "尚未生效"],
  [-15016, "格式"],
  [-15018, "审核未通过"],
]) {
  test(`native rejection ${code} exposes its real reason and code without crediting`, async () => {
    const diagnostics = [];
    const f = await fixture("success", {
      console: { warn: (...args) => diagnostics.push(args) },
    });
    f.h.wx.requestVirtualPayment = (options) =>
      options.fail({ errCode: code, errMsg: "native failure" });
    await f.page.pay();
    assert.match(f.page.data.paymentNotice, new RegExp(reason));
    assert.ok(f.page.data.paymentNotice.includes(String(code)));
    assert.ok(f.messages.some((message) => message.includes(String(code))));
    assert.equal(diagnostics[0][1].errCode, code);
    assert.equal(f.page.data.available, "0");
    assert.equal(f.page.data.pendingOrderId, "");
    assert.equal(f.h.storage.get("pending-payments"), undefined);
    assert.equal(
      f.calls.filter((call) => call.path.endsWith("/refresh")).length,
      0,
    );
  });
}

test("native diagnostics retain the error reason while hiding signed data and credentials", async () => {
  const diagnostics = [];
  const f = await fixture("success", {
    console: { warn: (...args) => diagnostics.push(args) },
  });
  f.h.wx.requestVirtualPayment = (options) =>
    options.fail({
      errCode: -15016,
      errMsg: `signData invalid: ${f.signed}; paySig=${options.paySig}; signature=${options.signature}; session_key='private-session-value' access_token=private-access-value`,
    });
  await f.page.pay();
  const output = JSON.stringify(diagnostics);
  assert.match(output, /signData invalid/);
  for (const value of [
    f.signed,
    "fixture-sig",
    "fixture-user-sig",
    "private-session-value",
    "private-access-value",
  ])
    assert.equal(
      output.includes(value) || f.page.data.paymentNotice.includes(value),
      false,
      "credential leaked into native diagnostics or the notice",
    );
  assert.ok(f.page.data.paymentNotice.includes("-15016"));
  // WeChat's own reason goes to vConsole, not to the notice.
  assert.doesNotMatch(f.page.data.paymentNotice, /signData invalid/);
});

for (const code of [-1, -15002, -15012, -999999]) {
  test(`unknown or duplicate result ${code} remains pending and cannot open another checkout`, async () => {
    const f = await fixture("success", { console: { warn() {} } });
    let nativeCalls = 0;
    f.h.wx.requestVirtualPayment = (options) => {
      nativeCalls++;
      options.fail({ errCode: code, errMsg: "unconfirmed payment result" });
    };
    await f.page.pay();
    await f.page.pay();
    assert.equal(nativeCalls, 1);
    assert.equal(f.page.data.pendingOrderId, "order-virtual");
    assert.equal(f.page.data.available, "0");
  });
}

test("snake-case string error fields are normalized without losing the failure reason", async () => {
  const diagnostics = [];
  const f = await fixture("success", {
    console: { warn: (...args) => diagnostics.push(args) },
  });
  f.h.wx.requestVirtualPayment = (options) =>
    options.fail({ err_code: "-15013", err_msg: "goodsPrice mismatch" });
  await f.page.pay();
  assert.match(f.page.data.paymentNotice, /价格/);
  assert.ok(f.page.data.paymentNotice.includes("-15013"));
  assert.equal(diagnostics[0][1].errMsg, "goodsPrice mismatch");
  assert.doesNotMatch(f.page.data.paymentNotice, /goodsPrice mismatch/);
});

test("the notice shows the code and our words, WeChat's reason only in vConsole", async () => {
  const logged = [];
  const f = await fixture("success", { console: { warn: (...args) => logged.push(args) } });
  f.h.wx.requestVirtualPayment = (options) => options.fail({ errCode: -15001, errMsg: "requestVirtualPayment:fail INVALID_PARAMS" });
  await f.page.pay();
  assert.match(f.page.data.paymentNotice, /支付参数校验未通过，请联系管理员（错误码 -15001）$/);
  assert.match(JSON.stringify(logged), /INVALID_PARAMS/);
});
