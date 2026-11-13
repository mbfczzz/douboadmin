const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("deleted account clears old session and drafts and presents registration again", async () => {
  const h = harness(); await h.api.signIn();
  h.storage.set("edit-draft", { private: "old" });
  h.storage.set("view-cache:mine", { private: "old" });
  h.wx.getStorageInfoSync = () => ({ keys: [...h.storage.keys()] });
  h.wx.canIUse = () => true;
  h.wx.request = o => {
    if (o.url.endsWith("/access")) o.success({ statusCode: 403, data: { code: "ACCOUNT_DELETED", error: "账号已删除，请重新注册" } });
    else o.success({ statusCode: 200, data: { wechatLogin: true, wechatPhoneLogin: true } });
  };
  const page = h.page("activate");
  page.setData({name:"旧姓名", phone:"13900000000", smsCode:"123456", codeRaw:"ABCD2345", code:"ABCD-2345"});
  await page.load();
  assert.equal(h.api.hasSession(), false);
  assert.equal(page.data.logged, false);
  assert.equal(page.data.accountDeleted, true);
  assert.equal(page.data.wechatReady, true);
  assert.equal(page.data.loadError, "");
  assert.equal(h.storage.has("edit-draft"), false);
  assert.equal(h.storage.has("view-cache:mine"), false);
  for(const key of ["name","phone","smsCode","codeRaw","code"]) assert.equal(page.data[key], "");
});

test("disabled account presents a clear status without a network retry error", async () => {
  const h = harness(); await h.api.signIn();
  h.wx.request = o => o.success({ statusCode: o.url.endsWith("/access") ? 403 : 200, data: { code: "ACCOUNT_DISABLED", error: "账号已停用，请联系管理员" } });
  const page = h.page("activate"); await page.load();
  assert.equal(h.api.hasSession(), true);
  assert.equal(page.data.status.status, "account_disabled");
  assert.match(page.data.status.message, /联系管理员/);
  assert.equal(page.data.loadError, "");
  assert.equal(page.data.accountDeleted, false);
});

test("disabled fresh login has the same explicit state and cannot create a session", async () => {
  const h = harness();
  h.wx.request = o => o.success({ statusCode: 403, data: { code: "ACCOUNT_DISABLED", error: "账号已停用，请联系管理员" } });
  const page = h.page("activate"); await page.authenticate();
  assert.equal(page.data.status.status, "account_disabled");
  assert.equal(page.data.loadError, "");
  assert.equal(h.api.hasSession(), false);
});

test("deleted business response redirects, while late response cannot clear a replacement session", async () => {
  const h = harness(); await h.api.signIn();
  h.wx.reLaunch = o => h.nav.push(o);
  let pending; h.wx.request = o => { pending = o; };
  const old = h.api.request("/jobs"); await new Promise(setImmediate);
  h.storage.set("douboSession", { token: "replacement", userId: "new-user", expiresAt: Date.now() + 60000 });
  pending.success({ statusCode: 403, data: { code: "ACCOUNT_DELETED" } });
  await assert.rejects(old);
  assert.equal(h.api.sessionToken(), "replacement");
  assert.equal(h.storage.get("account-deleted"), undefined);
  const next = h.api.request("/jobs"); await new Promise(setImmediate);
  pending.success({ statusCode: 403, data: { code: "ACCOUNT_DELETED" } });
  await assert.rejects(next);
  assert.equal(h.api.hasSession(), false);
  assert.equal(h.nav.at(-1).url, "/pages/activate/index");
});
