const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture() {
  const h = harness(); await h.api.signIn();
  const page = h.page("activate"), writes = [];
  page.owner = h.api.sessionUserId();
  page.setData({ logged: true, loading: false, name: "旧姓名", phone: "13900139000", smsCode: "123456",
    code: "ABCD2345", codeRaw: "ABCD2345", status: { active: false, status: "pending", profileRequired: true, smsRequired: true } });
  h.wx.request = o => {
    if (o.method === "POST") writes.push({ url: o.url, body: o.data, token: o.header.Authorization });
    o.success({ statusCode: 200, data: o.url.endsWith("/access")
      ? { active: false, status: "pending", profileRequired: true, name: "新账号资料", phone: "13900139001" }
      : { wechatLogin: true, wechatPhoneLogin: true } });
  };
  return { h, page, writes };
}

for (const action of ["register", "sendCode", "join"]) {
  const run = page => action === "join" ? page.join("ABCD2345", "code") : page[action]();
  test(`expired ${action} returns to login instead of replaying old input after sign-in`, async () => {
    const f = await fixture(), old = f.h.storage.get("douboSession");
    f.h.storage.set("douboSession", { ...old, expiresAt: Date.now() - 1 });
    await run(f.page);
    assert.deepEqual(f.writes, []);
    assert.equal(f.page.data.logged, false);
    assert.equal(f.page.data.name, "");
    assert.equal(f.page.data.codeRaw, "");
    assert.deepEqual(f.h.nav, []);
  });
  test(`${action} refuses a replacement account even before the page is refreshed`, async () => {
    const f = await fixture();
    f.h.storage.set("douboSession", { token: "replacement-token", userId: "replacement-user", expiresAt: Date.now() + 60000 });
    await run(f.page);
    assert.deepEqual(f.writes, []);
    assert.equal(f.page.owner, "replacement-user");
    assert.equal(f.page.data.name, "新账号资料");
    assert.equal(f.page.data.phone, "13900139001");
    assert.equal(f.page.data.smsCode, "");
    assert.equal(f.page.data.codeRaw, "");
  });
  test(`${action} binds the outgoing request to the original session`, async () => {
    const f = await fixture();
    const pending = run(f.page);
    f.h.storage.set("douboSession", { token: "replacement-token", userId: "replacement-user", expiresAt: Date.now() + 60000 });
    await pending;
    assert.deepEqual(f.writes, []);
    assert.equal(f.h.api.sessionToken(), "replacement-token");
  });
}

test("refreshing the same user's token preserves unfinished registration input", async () => {
  const f = await fixture(), old = f.h.storage.get("douboSession");
  f.h.storage.set("douboSession", { ...old, token: "renewed-same-user" });
  await f.page.load();
  assert.equal(f.page.data.name, "旧姓名");
  assert.equal(f.page.data.phone, "13900139000");
  assert.equal(f.page.data.smsCode, "123456");
  assert.equal(f.page.data.codeRaw, "ABCD2345");
});
