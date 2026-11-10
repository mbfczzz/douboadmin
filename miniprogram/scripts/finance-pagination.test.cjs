const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function fixture() {
  const h = harness({ setTimeout: () => 1, clearTimeout() {} });
  await h.api.signIn();
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  h.wx.pageScrollTo = () => {};
  const requests = [];
  let failPage = false;
  h.wx.request = o => {
    const url = new URL(o.url), page = Number(url.searchParams.get("page") || 1);
    requests.push(url.pathname + url.search);
    if (failPage && page === 2) { o.fail({ errMsg: "offline" }); return; }
    let data;
    if (url.pathname === "/api/wallet") data = {
      wallet: { userId: "wx-user", availableUnits: 2000, heldUnits: 0 },
      settings: { rechargeEnabled: false, pointsPerYuan: 100 }, pricing: { ready: false },
    };
    else {
      const ledger = url.pathname.endsWith("/ledger");
      const row = { id: `row-${page}`, createdAt: "2026-11-01T00:00:00Z", data: ledger
        ? { kind: "topup", availableDelta: 100, heldDelta: 0, note: `entry ${page}` }
        : { status: "paid", userId: "wx-user", amountFen: 100, pointsUnits: 10000 } };
      data = { items: [row], page, size: 20, total: 521 };
    }
    o.success({ statusCode: 200, data });
  };
  return { h, requests, fail() { failPage = true; } };
}

test("order page requests server pages and replaces visible records", async () => {
  const f = await fixture(), page = f.h.page("orders");
  await page.load();
  assert.equal(page.data.pages, 27);
  await page.changePage({ currentTarget: { dataset: { step: 1 } } });
  assert.equal(page.data.page, 2);
  assert.deepEqual(Array.from(page.data.rows, row => row.id), ["row-2"]);
  assert.ok(f.requests.includes("/api/orders?page=2&size=20"));
  await page.changePage({ currentTarget: { dataset: { step: -1 } } });
  f.fail();
  await page.changePage({ currentTarget: { dataset: { step: 1 } } });
  assert.equal(page.data.page, 1);
  assert.equal(page.data.rows[0].id, "row-1");
  assert.ok(page.data.loadError);
});

test("wallet ledger reads older pages and retains page during balance refresh", async () => {
  const f = await fixture(), page = f.h.page("wallet");
  await page.load();
  assert.equal(page.data.ledgerPages, 27);
  await page.changeLedgerPage({ currentTarget: { dataset: { step: 1 } } });
  assert.equal(page.data.ledger[0].id, "row-2");
  await page.load();
  assert.equal(page.data.ledgerPage, 2);
  assert.equal(page.data.ledger[0].id, "row-2");
  assert.ok(f.requests.includes("/api/wallet/ledger?page=2&size=20"));
});
