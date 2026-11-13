const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("typed and scanned share codes join with their method", async () => {
  const h = harness(),
    page = h.page("activate");
  page.setData({ logged: true, code: "abcd-2345" });
  h.wx.reLaunch = () => {};
  const bodies = [];
  h.api.request = async (path, method, body) => {
    bodies.push([path, body.code, body.method]);
    return { active: true, status: "active" };
  };
  page.confirm();
  await new Promise((r) => setTimeout(r));
  page.entering = false;
  h.wx.scanCode = async () => ({ result: "DOUBO-SHARE:WXYZ6789" });
  await page.scan();
  assert.deepEqual(bodies, [
    ["/access/join", "ABCD2345", "code"],
    ["/access/join", "WXYZ6789", "scan"],
  ]);
});

test("a scan only registers: the page waits for the platform to open it", async () => {
  const h = harness(),
    page = h.page("activate"),
    toasts = [];
  let enters = 0;
  page.setData({ logged: true });
  h.wx.reLaunch = () => enters++;
  h.wx.showToast = (o) => toasts.push(o.title);
  h.api.request = async () => ({
    active: false,
    status: "review",
    message: "已登记，等待超级管理员开通",
    partnerName: "华东分公司",
  });
  await page.join("ABCD2345", "scan");
  assert.equal(enters, 0);
  assert.equal(page.data.status.status, "review");
  assert.deepEqual(toasts, ["已登记，等待超级管理员开通"]);
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
  page.setData({ code: "ABCD-2345" });
  await page.join("ABCD2345", "code");
  assert.equal(moves[0], "/pages/templates/index");
});
test("invalid scanned content never reaches the join endpoint", async () => {
  const h = harness(),
    page = h.page("activate");
  let submits = 0;
  page.setData({ logged: true, code: "https://untrusted.example/path" });
  h.api.request = async () => {
    submits++;
  };
  h.wx.showToast = () => {};
  page.confirm();
  h.wx.scanCode = async () => ({
    result: "DOUBO-ACTIVATE:AAAABBBBCCCCDDDDEEEE",
  });
  await page.scan();
  assert.equal(submits, 0);
});
test("a replayed code for a disabled account does not enter the app", async () => {
  const h = harness(),
    page = h.page("activate");
  let enters = 0;
  h.wx.reLaunch = () => enters++;
  page.setData({ logged: true });
  h.wx.showToast = () => {};
  h.api.request = async () => ({
    active: false,
    status: "disabled",
    message: "已停用",
  });
  await page.join("ABCD2345", "scan");
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
    return { active: false, status: "pending" };
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
  assert.equal(page.data.countdown, 0);
  page.onUnload();
});
test("the invite code fills eight cells, gains its dash and backspaces cleanly", () => {
  const h = harness(),
    { typedCode, prettyCode } = h.service("access"),
    page = h.page("activate");
  assert.equal(typedCode("kmnp2345").shown, "KMNP-2345");
  assert.equal(typedCode("KMNP 2345").raw, "KMNP2345");
  assert.equal(typedCode("DOUBO-SHARE:WXYZ6789").shown, "WXYZ-6789");
  assert.equal(typedCode("ABCD23456789").raw, "ABCD2345");
  assert.equal(typedCode("km0p").raw, "KMP");
  assert.equal(typedCode("km0p").dropped, true);
  assert.equal(prettyCode("ABC"), "ABC");
  // Typing: the hidden input keeps the bare code; the display gains its
  // dash after the fourth character and loses it again on backspace.
  const chars = () => page.data.codeSlots.map((s) => s.char).join("");
  assert.equal(page.input({ detail: { value: "kmn" } }), "KMN");
  assert.equal(page.input({ detail: { value: "KMNp" } }), "KMNP");
  assert.equal(page.data.code, "KMNP-");
  assert.equal(page.input({ detail: { value: "KMNP2" } }), "KMNP2");
  assert.equal(page.data.code, "KMNP-2");
  assert.equal(page.data.codeCursor, 5);
  page.input({ detail: { value: "KMNP" } });
  assert.equal(page.data.code, "KMNP");
  assert.equal(chars(), "KMNP");
  assert.equal(page.data.codeReady, false);
  page.input({ detail: { value: "KMNP-2345" } });
  assert.equal(page.data.codeReady, true);
  assert.equal(chars(), "KMNP2345");
  assert.equal(page.data.codeCursor, 7);
  assert.equal(page.data.codeHint, "");
  page.input({ detail: { value: "abcd0" } });
  assert.match(page.data.codeHint, /不含 I、O、0、1/);
});

test("a pasted or fully typed code registers by itself, once", async () => {
  const h = harness(),
    page = h.page("activate");
  page.setData({ logged: true });
  const joins = [];
  h.api.request = async (path, method, body) => {
    joins.push(body.code);
    return { active: false, status: "review" };
  };
  h.wx.showToast = () => {};
  // The scan view is the default; the link switches to typing a code.
  assert.equal(page.data.codeMode, false);
  page.useCode();
  assert.equal(page.data.codeMode, true);
  assert.equal(page.data.codeFocus, true);
  h.wx.getClipboardData = ({ success }) => success({ data: "DOUBO-SHARE:wxyz6789" });
  page.pasteCode();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(joins, ["WXYZ6789"]);
  // After registering, the code empties and the scan view returns.
  assert.equal(page.data.code, "");
  assert.equal(page.data.codeRaw, "");
  assert.equal(page.data.codeMode, false);
  // Typing: nothing is sent until the eighth character.
  page.setData({ status: null });
  page.useCode();
  page.input({ detail: { value: "KMNP234" } });
  assert.equal(joins.length, 1);
  page.input({ detail: { value: "KMNP2345" } });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(joins, ["WXYZ6789", "KMNP2345"]);
  // Switching back to scanning clears a half-typed code.
  page.useCode();
  page.input({ detail: { value: "AB" } });
  page.useScan();
  assert.equal(page.data.codeMode, false);
  assert.equal(page.data.codeRaw, "");
});
