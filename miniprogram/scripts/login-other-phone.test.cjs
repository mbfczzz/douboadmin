const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// After logging out, 使用其他手机号 must ask for a phone and SMS code, not
// silently sign back into the account this WeChat is linked to.
test("other phone signs in by SMS with the WeChat code attached", async () => {
  const h = harness({ setInterval: () => 1, clearInterval() {} });
  const requests = [];
  h.wx.login = async () => ({ code: "wx-code" });
  h.wx.request = (o) => {
    const path = new URL(o.url).pathname;
    requests.push([path, o.data]);
    const data = path.endsWith("/auth/phone/code") ? { challenge: "c".repeat(32), resendIn: 60 }
      : { token: "t", userId: "other-user", expiresIn: 86400, provider: "phone" };
    o.success({ statusCode: 200, data });
  };
  const page = h.page("login");
  page.finish = async () => { page.finished = true; };
  page.otherPhone();
  assert.equal(page.data.smsOpen, true);
  page.smsPhoneInput({ detail: { value: "13800138000" } });
  await page.sendCode();
  assert.equal(page.data.smsWait, 60);
  page.smsCodeInput({ detail: { value: "123456" } });
  await page.smsLogin();
  const login = requests.find(([p]) => p.endsWith("/auth/phone/login"));
  assert.deepEqual({ ...login[1] }, { phone: "13800138000", code: "123456", challenge: "c".repeat(32), source: "miniprogram", wechatCode: "wx-code" });
  assert.equal(h.storage.get("douboSession").userId, "other-user");
  assert.equal(page.finished, true);
  assert.ok(!requests.some(([p]) => p.endsWith("/auth/wechat")), "never falls back to the WeChat-linked account");
});

test("other phone validates input before sending", async () => {
  const h = harness();
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  const page = h.page("login");
  page.smsPhoneInput({ detail: { value: "123" } });
  await page.sendCode();
  page.smsPhoneInput({ detail: { value: "13800138000" } });
  await page.smsLogin();
  assert.deepEqual(toasts, ["请输入正确的手机号", "请先获取验证码"]);
});

// From the activation page (already signed in to the WeChat-linked account),
// 使用其他手机号 opens this page on the SMS form instead of bouncing back.
test("opening with sms=1 stays on the SMS form even when signed in", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("login");
  page.onLoad({ sms: "1" });
  assert.equal(page.data.smsOpen, true);
  assert.equal(page.data.returning, false);
  const wxml = require("node:fs").readFileSync("pages/activate/index.wxml", "utf8");
  assert.match(wxml, /<navigator wx:if="\{\{phoneReady\}\}" url="\/pages\/login\/index\?sms=1"/);
  assert.doesNotMatch(wxml, /bindtap="login"[^>]*>使用其他手机号/);
});
