const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./virtual-payment-fixture.cjs");
const tick = () => new Promise(setImmediate);

function switchAccount(f) {
  f.h.storage.set("douboSession", {
    token: "new-account-token",
    userId: "new-user",
    expiresAt: Date.now() + 60000,
  });
  f.info.wallet.userId = "new-user";
  f.row.data.userId = "new-user";
}

test("an old wallet view cannot charge the newly signed-in account", async () => {
  const f = await fixture();
  assert.equal(f.page.data.info.wallet.userId, "wx-user");
  switchAccount(f);
  await f.page.pay();
  await tick();
  assert.equal(f.calls.filter((c) => c.path === "/orders").length, 0);
  assert.equal(f.native.length, 0);
  assert.equal(f.page.data.info.wallet.userId, "new-user");
});

test("switching account clears purchase drafts and an old payment cannot unlock the new checkout", async () => {
  const f = await fixture();
  const logins = [];
  f.h.wx.login = (options) => {
    logins.push(options.success);
  };
  f.page.setData({ customAmount: "345.60" });
  const oldPayment = f.page.pay();
  await tick();
  assert.equal(logins.length, 1);
  switchAccount(f);
  await f.page.load();
  assert.equal(f.page.data.customAmount, "");
  assert.equal(f.page.data.busy, false);
  f.page.chooseProduct({ currentTarget: { dataset: { id: "sku-1" } } });
  const newPayment = f.page.pay();
  await tick();
  assert.equal(logins.length, 2);
  logins[0]({ code: "late-old-login" });
  await oldPayment;
  await tick();
  assert.equal(f.page.data.busy, true);
  assert.equal(f.native.length, 0);
  logins[1]({ code: "new-owner-login" });
  await newPayment;
  assert.equal(f.native.length, 1);
});

test("a session change after order creation cannot continue into payment signing", async () => {
  const f = await fixture();
  const original = f.h.wx.request;
  f.h.wx.request = (options) => {
    original(options);
    if (options.url.endsWith("/orders")) switchAccount(f);
  };
  await f.page.pay();
  await tick();
  assert.equal(f.calls.filter((c) => c.path === "/orders").length, 1);
  assert.equal(f.calls.filter((c) => c.path.endsWith("/pay")).length, 0);
  assert.equal(f.native.length, 0);
  assert.equal(f.page.data.info.wallet.userId, "new-user");
});

test("refreshing the same account's session during payment does not leave checkout locked", async () => {
  const f = await fixture();
  let finish;
  f.h.wx.login = (options) => {
    finish = options.success;
  };
  const oldPayment = f.page.pay();
  await tick();
  f.h.storage.set("douboSession", {
    token: "renewed-token",
    userId: "wx-user",
    expiresAt: Date.now() + 60000,
  });
  await f.page.load();
  finish({ code: "old-session-code" });
  await oldPayment;
  await tick();
  assert.equal(f.native.length, 0);
  assert.equal(f.page.data.busy, false);
});

test("a late successful payment response refreshes the new wallet without showing the old payment", async () => {
  const f = await fixture();
  const original = f.h.wx.request;
  let reads = 0;
  f.h.wx.request = (options) => {
    original(options);
    if (
      options.method === "GET" &&
      options.url.endsWith("/orders/order-virtual") &&
      ++reads === 2
    )
      switchAccount(f);
  };
  await f.page.pay();
  await tick();
  assert.equal(
    f.native.length,
    1,
    "only the original authorized payment was opened",
  );
  assert.equal(f.page.data.info.wallet.userId, "new-user");
  assert.equal(f.page.data.pendingOrderId, "");
  assert.equal(f.page.data.paymentNotice, "");
  assert.equal(f.page.data.available, "0");
});
