const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture() {
  const timers = new Map();
  let timerID = 0;
  const h = harness({
    setTimeout(fn) {
      const id = ++timerID;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  // The widget uses the wallet page's recharge rule, which reads the platform.
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  await h.api.signIn();
  const balance = h.component("components/points-balance");
  balance._visible = true;
  const info = {
    wallet: { userId: "wx-user", availableUnits: 100000, heldUnits: 0 },
    paymentReady: true,
    settings: { rechargeEnabled: true },
  };
  h.wx.request = (options) => options.success({ statusCode: 200, data: info });
  return { h, balance, info, timers };
}

test("balance shows server credit, reservation and successful settlement without subtracting twice", async () => {
  const f = await fixture();
  await f.balance.reload();
  assert.equal(f.balance.data.available, "1000");
  assert.equal(f.balance.data.rechargeEnabled, true);
  f.info.wallet.availableUnits = 97500;
  f.info.wallet.heldUnits = 2500;
  await f.balance.reload();
  assert.equal(f.balance.data.available, "975");
  assert.equal(f.balance.data.held, "25");
  f.info.wallet.heldUnits = 0;
  await f.balance.reload();
  assert.equal(f.balance.data.available, "975");
  assert.equal(f.balance.data.held, "0");
  f.info.wallet.availableUnits = 100000;
  await f.balance.reload();
  assert.equal(f.balance.data.available, "1000");
  f.balance.stop();
  assert.equal(f.timers.size, 0);
});

test("late wallet responses cannot update a hidden component or keep its poll alive", async () => {
  const f = await fixture();
  let request;
  f.h.wx.request = (options) => {
    request = options;
  };
  const loading = f.balance.reload();
  await Promise.resolve();
  f.balance.stop();
  request.success({ statusCode: 200, data: f.info });
  await loading;
  assert.equal(f.balance.data.loaded, false);
  assert.equal(f.timers.size, 0);
});

test("a refresh failure preserves the last balance and logout clears displayed amounts", async () => {
  const f = await fixture();
  await f.balance.reload();
  f.h.wx.request = (options) => options.fail();
  await f.balance.reload();
  assert.equal(f.balance.data.available, "1000");
  assert.match(f.balance.data.loadError, /刷新/);
  f.h.api.clearSession();
  await f.balance.reload();
  assert.equal(f.balance.data.available, "—");
  assert.equal(f.balance.data.logged, false);
  f.balance.stop();
});

test("returning to the balance card unlocks navigation without allowing double taps", async () => {
  const f = await fixture();
  f.balance.openWallet();
  f.balance.openWallet();
  assert.equal(f.h.nav.length, 1);
  f.balance.pageLifetimes.hide.call(f.balance);
  f.balance.pageLifetimes.show.call(f.balance);
  await new Promise(setImmediate);
  f.balance.openWallet();
  f.balance.openWallet();
  assert.equal(f.h.nav.length, 2);
  f.balance.stop();
});
