const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("authorization refresh ignores repeat taps and scan stays disabled while checking", async () => {
  const h = harness(), page = h.page("activate");
  let requests = 0, scans = 0;
  page.setData({ logged: true, loading: false });
  page.load = async () => { requests++; page.setData({ loading: true }); };
  h.wx.scanCode = async () => { scans++; return { result: "ABCD2345" }; };
  page.refresh(); page.refresh(); page.refresh();
  await page.scan();
  assert.equal(requests, 1);
  assert.equal(scans, 0);
});

test("late login refusal from a cancelled generation cannot overwrite a new session", async () => {
  const h = harness(); let pending;
  h.wx.request = o => { pending = o; };
  const old = h.api.signIn();
  const rejected = assert.rejects(old, /取消登录/);
  await new Promise(setImmediate);
  h.api.clearSession();
  h.storage.set("douboSession", { token: "new-session", userId: "new-user", expiresAt: Date.now() + 60000 });
  pending.success({ statusCode: 403, data: { code: "ACCOUNT_DISABLED", error: "旧账号已停用" } });
  await rejected;
  assert.equal(h.api.sessionToken(), "new-session");
});

test("old wallet quote and artwork responses do not redraw a replaced account or hidden page", async () => {
  for (const kind of ["quote", "art"]) {
    for (const change of ["account", "hide", "unchanged"]) {
      const h = harness(); await h.api.signIn();
      const page = h.page("wallet");
      page.setData({ info: { wallet: { userId: "wx-user", availableUnits: 10000, heldUnits: 0 } }, uses: [], products: [] });
      let pending;
      h.wx.request = o => {
        if (o.url.endsWith("/config")) o.success({ statusCode: 200, data: { models: [{ id: "m", kind: "image" }] } });
        else pending = o;
      };
      const insight = h.service("../pages/wallet/insights");
      const call = kind === "quote" ? insight.loadInsights(page) : insight.loadArt(page);
      await new Promise(setImmediate);
      assert.ok(pending);
      const updates = [];
      page.setData = value => updates.push(value);
      if (change === "account") h.storage.set("douboSession", { token: "next-session", userId: "next-user", expiresAt: Date.now() + 60000 });
      else if (change === "hide") page.revision++;
      pending.success({ statusCode: 200, data: kind === "quote" ? { billingEnabled: true, units: 100 } : { items: [{ id: "t", data: { cover: "https://example.test/old.jpg" } }], total: 1 } });
      await call;
      if (change === "unchanged") assert.ok(updates.length > 0, "valid current responses must still render");
      else assert.deepEqual(updates, []);
    }
  }
});

test("wallet and ledger finishing at different times cannot display the old account balance", async () => {
  const h = harness(); await h.api.signIn();
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  let ledger;
  h.wx.request = o => {
    if (o.url.endsWith("/wallet")) o.success({ statusCode: 200, data: { wallet: { userId: "wx-user", availableUnits: 10000, heldUnits: 0 } } });
    else ledger = o;
  };
  const page = h.page("wallet"), loading = page.load();
  await new Promise(setImmediate);
  h.storage.set("douboSession", { token: "replacement", userId: "other", expiresAt: Date.now() + 60000 });
  ledger.success({ statusCode: 200, data: [] });
  await loading;
  assert.equal(page.data.info, null);
  assert.equal(page.data.available, "—");
});
