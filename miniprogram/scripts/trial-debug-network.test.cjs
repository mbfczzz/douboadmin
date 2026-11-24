const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("configuration, login, access and uploads wait for the same trial debug callback", async () => {
  const h = harness(), debug = [], sent = [];
  h.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: "trial" } });
  h.wx.setEnableDebug = options => debug.push(options);
  h.storage.set("douboSession", { token: "test-session", userId: "one", expiresAt: Date.now() + 60000 });
  h.wx.request = options => {
    sent.push(options.url);
    options.success({ statusCode: 200, data: { active: true, activationRequired: true } });
  };
  h.wx.uploadFile = options => {
    sent.push(options.url);
    options.success({ statusCode: 200, data: JSON.stringify({ id: "asset", data: { url: "https://example.test/image.png" } }) });
  };
  const calls = [
    h.api.request("/config", "GET", undefined, undefined, false),
    h.service("transport").publicRequest("/auth/wechat", "POST", { code: "fixture" }),
    h.service("access").accessStatus(),
    h.api.upload("temp-image.png"),
  ];
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(debug.length, 1);
  assert.equal(debug[0].enableDebug, true);
  assert.deepEqual(sent, []);
  debug[0].success();
  await Promise.all(calls);
  assert.equal(sent.length, 4);
  assert.ok(sent.some(url => url.endsWith("/api/config")));
  assert.ok(sent.some(url => url.endsWith("/api/auth/wechat")));
  assert.ok(sent.some(url => url.endsWith("/api/access")));
  assert.ok(sent.some(url => url.endsWith("/api/assets")));
});
