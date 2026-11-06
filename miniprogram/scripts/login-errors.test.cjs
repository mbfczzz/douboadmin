const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("WeChat SDK errors retain their reason and never reach the backend exchange", async () => {
  const h = harness();
  h.wx.login = async () => {
    throw { errMsg: "login:fail network unavailable" };
  };
  await assert.rejects(
    h.api.signIn(),
    (error) =>
      error instanceof Error &&
      /微信登录/.test(error.message) &&
      /network unavailable/.test(error.message),
  );
  assert.equal(h.sent.length, 0);
  assert.equal(h.api.hasSession(), false);
  h.wx.login = async () => ({ code: "fresh-after-failure" });
  await h.api.signIn();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].data.code, "fresh-after-failure");
});

test("activation login keeps a readable SDK failure on the page and allows retry", async () => {
  const h = harness(),
    page = h.page("activate"),
    toasts = [];
  h.wx.showToast = (options) => toasts.push(options.title);
  h.api.signIn = async () => {
    throw { errMsg: "login:fail permission denied" };
  };
  await page.login();
  assert.equal(page.data.busy, false);
  assert.match(page.data.loadError, /permission denied/);
  assert.equal(toasts[0], page.data.loadError);
  let cleared = false;
  h.api.signIn = async () => {
    cleared = page.data.loadError === "";
  };
  h.api.request = async () => ({ wechatLogin: true });
  await page.login();
  assert.equal(cleared, true);
});

test("UI errors support native error objects, ordinary errors and string reasons", () => {
  const h = harness(),
    messages = [];
  h.wx.showToast = (options) => messages.push(options.title);
  for (const value of [
    { errMsg: "scanCode:fail camera unavailable" },
    { message: "跨上下文错误" },
    new Error("标准错误"),
    "服务暂不可用",
    null,
  ])
    h.api.error(value);
  assert.deepEqual(messages, [
    "scanCode:fail camera unavailable",
    "跨上下文错误",
    "标准错误",
    "服务暂不可用",
    "操作失败",
  ]);
});

test("cancelled authentication does not display an activation error", async () => {
  const h = harness(),
    page = h.page("activate"),
    messages = [];
  h.wx.showToast = (options) => messages.push(options.title);
  h.api.signIn = async () => {
    throw new h.api.AuthCancelledError();
  };
  await page.login();
  assert.equal(page.data.loadError, "");
  assert.equal(page.data.busy, false);
  assert.deepEqual(messages, []);
});
