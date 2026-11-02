const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture() {
  const h = harness();
  await h.api.signIn();
  const page = h.page("wallet");
  const info = {
    wallet: { userId: "wx-user", availableUnits: 0, heldUnits: 0 },
    settings: {
      rechargeEnabled: true,
      minRechargeFen: 100,
      maxRechargeFen: 100000,
      pointsPerYuan: 100,
    },
    settingsVersion: 1,
    paymentReady: true,
  };
  const orders = new Map();
  let created = 0,
    payments = 0;
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  h.wx.requestPayment = (o) => {
    payments++;
    o.success();
  };
  h.api.request = async (route) => (route === "/wallet" ? info : []);
  h.wx.request = (o) => {
    const p = new URL(o.url).pathname.replace("/api", "");
    let data;
    if (p === "/wallet") data = info;
    else if (p === "/orders" && o.method === "POST") {
      const id = "new-" + ++created;
      data = {
        id,
        data: {
          status: "created",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      };
      orders.set(id, data);
    } else if (p.endsWith("/pay")) data = {};
    else if (p.endsWith("/refresh")) {
      const row = orders.get(p.split("/")[2]);
      row.data.status = "paid";
      data = row;
    } else data = orders.get(p.split("/")[2]);
    assert.ok(data, "unexpected request " + p);
    o.success({ statusCode: 200, data });
  };
  page.setData({ info, amount: "10" });
  function draft(
    status,
    expiresAt = new Date(Date.now() + 60000).toISOString(),
  ) {
    orders.set("old", { id: "old", data: { status, expiresAt } });
    h.storage.set("pending-recharge", {
      hash: JSON.stringify({ owner: "wx-user", fen: 1000, version: 1 }),
      key: "original-key",
      id: "old",
    });
  }
  return { h, page, draft, counts: () => ({ created, payments }) };
}

test("a previously paid recharge is reconciled once and does not block the next purchase", async () => {
  const { h, page, draft, counts } = await fixture();
  draft("paid");
  await page.pay();
  assert.equal(h.storage.has("pending-recharge"), false);
  assert.equal(counts().payments, 0);
  await page.pay();
  assert.deepEqual(counts(), { created: 1, payments: 1 });
});

test("closed and expired drafts are cleared without opening payment", async () => {
  for (const status of ["closed", "created"]) {
    const { h, page, draft, counts } = await fixture();
    draft(status, new Date(Date.now() - 60000).toISOString());
    await page.pay();
    assert.equal(h.storage.has("pending-recharge"), false);
    assert.deepEqual(counts(), { created: 0, payments: 0 });
    await page.pay();
    assert.deepEqual(counts(), { created: 1, payments: 1 });
  }
});

test("confirming an older order does not erase a different recharge draft", async () => {
  const { h, page } = await fixture();
  h.wx.requestPayment = (o) => {
    h.storage.set("pending-recharge", {
      id: "another-order",
      key: "another-key",
    });
    o.success();
  };
  await page.pay();
  assert.equal(h.storage.get("pending-recharge").id, "another-order");
});

test("a late payment callback after logout does not reopen login", async () => {
  const { h, page } = await fixture();
  let finish;
  h.wx.requestPayment = (o) => (finish = o.success);
  const paying = page.pay();
  while (!finish) await new Promise(setImmediate);
  h.api.clearSession();
  finish();
  await paying;
  assert.equal(h.nav.length, 0);
  assert.equal(page.data.busy, false);
});

test("a changed channel price refreshes the quote but never auto-starts another payment",async()=>{
  const {h,page,counts}=await fixture();
  const next={...page.data.info,settingsVersion:2,pricing:{ready:true,version:"updated-price",retailPer100Fen:11000}};
  h.api.request=async path=>path==="/wallet"?next:[];
  h.wx.request=o=>o.success({statusCode:409,data:{error:"兑换价格已更新，请刷新确认"}});
  await page.pay();
  assert.equal(page.data.info.pricing.version,"updated-price");
  assert.equal(page.data.displayRate,"90.90");assert.equal(counts().payments,0);
});
