const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("scan and manual activation report their method without trusting it for identity", async () => {
  const h = harness(),
    page = h.page("activate");
  page.setData({ logged: true, code: "AAAABBBBCCCCDDDDEEEE" });
  h.wx.reLaunch = () => {};
  const methods = [];
  h.api.request = async (path, method, body) => {
    methods.push(body.method);
    return { active: true, status: "active" };
  };
  await page.activate({ currentTarget: { dataset: {} } });
  h.wx.scanCode = async () => ({
    result: "DOUBO-ACTIVATE:AAAABBBBCCCCDDDDEEEE",
  });
  await page.scan();
  assert.deepEqual(methods, ["code", "qr"]);
});

test("direct application auto-approves without an activation code", async () => {
  const h = harness(),
    page = h.page("activate"),
    requests = [],
    moves = [];
  page.setData({ logged: true });
  h.wx.reLaunch = (o) => moves.push(o.url);
  h.api.request = async (path, method) => {
    requests.push([path, method]);
    return { active: true, status: "direct" };
  };
  await page.direct();
  assert.deepEqual(requests, [["/access/direct", "POST"]]);
  assert.equal(moves[0], "/pages/templates/index");
});

test("activation-required business response redirects instead of exposing data", async () => {
  const h = harness();
  await h.api.signIn();
  const relaunch = [];
  h.wx.reLaunch = (o) => relaunch.push(o.url);
  h.wx.request = (o) =>
    o.success({
      statusCode: 403,
      data: { code: "ACTIVATION_REQUIRED", error: "请先激活" },
    });
  await assert.rejects(h.api.request("/jobs"));
  assert.deepEqual(relaunch, ["/pages/activate/index"]);
});
test("public catalog requests carry the logged-in identity for activation checks", async () => {
  const h = harness();
  await h.api.signIn();
  let token;
  h.wx.request = (o) => {
    token = o.header.Authorization;
    o.success({
      statusCode: 200,
      data: { models: [], activationRequired: true },
    });
  };
  await h.api.request("/config", "GET", undefined, undefined, false);
  assert.equal(token, "Bearer opaque-token");
  assert.equal(h.storage.get("activation-required"), true);
});
test("wechat login does not leave the activation page until a grant is active", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("activate");
  const moves = [];
  h.wx.reLaunch = (o) => moves.push(o.url);
  h.wx.request = (o) =>
    o.success({ statusCode: 200, data: { active: false, status: "pending" } });
  await page.load();
  assert.equal(page.data.logged, true);
  assert.equal(page.data.status.active, false);
  assert.equal(moves.length, 0);
  h.api.request = async () => ({ active: true, status: "active" });
  page.setData({ code: "AAAA-BBBB-CCCC-DDDD-EEEE" });
  await page.activate();
  assert.equal(moves[0], "/pages/templates/index");
});
test("invalid scanned content never reaches the redemption endpoint", async () => {
  const h = harness(),
    page = h.page("activate");
  let submits = 0;
  page.setData({ logged: true, code: "https://untrusted.example/path" });
  h.api.request = async () => {
    submits++;
  };
  await page.activate();
  assert.equal(submits, 0);
});
test("a replayed code for a disabled account does not enter the app", async () => {
  const h = harness(),
    page = h.page("activate");
  let enters = 0;
  h.wx.reLaunch = () => enters++;
  page.setData({ logged: true, code: "AAAABBBBCCCCDDDDEEEE" });
  h.api.request = async () => ({
    active: false,
    status: "disabled",
    message: "已停用",
  });
  await page.activate();
  assert.equal(enters, 0);
  assert.equal(page.data.busy, false);
});

test("registration sends an SMS code, then verifies name and phone before activation", async () => {
  const h = harness(),
    page = h.page("activate"),
    requests = [];
  page.setData({
    logged: true,
    status: { active: false, status: "pending", profileRequired: true },
  });
  h.wx.showToast = () => {};
  h.api.request = async (path, method, body) => {
    requests.push([path, body]);
    if (path === "/access/sms") return { resendIn: 60, debugCode: "123456" };
    return { active: false, status: "pending", openSignup: true };
  };
  page.setData({ name: " 张三 ", phone: "13800138000" });
  await page.sendCode();
  assert.equal(page.data.smsCode, "123456");
  assert.equal(page.data.countdown, 60);
  await page.sendCode(); // still counting down
  await page.register();
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
    ["/access/sms", { phone: "13800138000" }],
    ["/access/profile", { name: "张三", phone: "13800138000", code: "123456" }],
  ]);
  assert.equal(page.data.status.profileRequired, undefined);
  assert.equal(page.data.status.openSignup, true);
  assert.equal(page.data.countdown, 0);
  page.onUnload();
});
