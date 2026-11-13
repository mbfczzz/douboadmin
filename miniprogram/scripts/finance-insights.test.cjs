const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("packages show their price per 100 points and the best value", () => {
  const { productCards } = harness().service("../pages/wallet/insights");
  const cards = productCards([
    { id: "a", name: "入门", amountFen: 990, pointsUnits: 100000 },
    { id: "b", name: "常用", amountFen: 4990, pointsUnits: 520000 },
  ]);
  assert.equal(cards[0].per100, "0.99");
  assert.equal(cards[0].best, false);
  assert.equal(cards[1].best, true);
  assert.equal(cards[1].bonus, "多得 3%");
  // A single package is never labelled best value.
  assert.equal(productCards([{ id: "a", name: "x", amountFen: 990, pointsUnits: 100000 }])[0].best, false);
});

test("ledger rows gain a day heading once per day and the balance after", () => {
  const { ledgerRows } = harness().service("../pages/wallet/insights");
  const now = new Date().toISOString();
  const row = (id, createdAt) => ({ id, createdAt, data: { kind: "topup", availableDelta: 100, heldDelta: 0, note: "", availableAfter: 123400 } });
  const rows = ledgerRows([row("1", now), row("2", now), row("3", "2026-01-02T10:00:00+08:00")]);
  assert.deepEqual([...rows].map((r) => [r.showDay, r.day]), [[true, "今天"], [false, "今天"], [true, "1月2日"]]);
  assert.equal(rows[0].after, "1,234");
});

test("orders expose a payment window, progress steps and detail lines", () => {
  const { orderExtras } = harness().service("../pages/orders/details");
  const now = Date.parse("2026-11-12T10:00:00Z");
  const created = orderExtras({ id: "o1", createdAt: "2026-11-12T09:55:00Z", data: { status: "created", amountFen: 990, pointsUnits: 100000, expiresAt: "2026-11-12T10:12:30Z", channel: "wechat_virtual", virtual: { productName: "入门积分包" } } }, now);
  assert.equal(created.window, "13 分钟内完成支付");
  assert.deepEqual([...created.steps].map((s) => s.on), [true, false, false]);
  const paid = orderExtras({ id: "o2", createdAt: "2026-11-12T09:55:00Z", data: { status: "paid", amountFen: 4990, pointsUnits: 520000, expiresAt: "2026-11-12T09:00:00Z", transactionId: "4200001" } }, now);
  assert.equal(paid.window, "");
  assert.deepEqual([...paid.steps].map((s) => s.on), [true, true, true]);
  assert.deepEqual([...paid.lines].map((l) => l.label), ["下单时间", "支付方式", "商品", "单价", "微信交易号"]);
  assert.equal(paid.lines[3].value, "¥0.96 / 100 积分");
});

test("every ledger icon exists in the icon font", () => {
  const fs = require("node:fs");
  const font = fs.readFileSync("node_modules/tdesign-miniprogram/miniprogram_dist/icon/icon.wxss", "utf8");
  const line = fs.readFileSync("services/wallet-ledger.ts", "utf8").split("\n").find((l) => l.includes("icon:"));
  const names = [...line.matchAll(/\? "([a-z0-9-]+)"|: "([a-z0-9-]+)",?\s*$/g)].map((m) => m[1] || m[2]);
  assert.ok(names.length >= 5);
  for (const name of names) assert.ok(font.includes(`t-icon-${name}:before`), name);
});

test("points group thousands and keep cents only when present", () => {
  const { points } = harness().service("business");
  assert.equal(points(1248000), "12,480");
  assert.equal(points(123450), "1,234.50");
  assert.equal(points(8000), "80");
  assert.equal(points(0), "0");
  assert.equal(points(-12000000), "-120,000");
});

test("packages fan out more real covers the bigger they are; none without covers", async () => {
  const h = harness();
  const { loadArt, productCards } = h.service("../pages/wallet/insights");
  const page = { data: { products: productCards([1, 2, 3, 4].map((n) => ({ id: "p" + n, name: "x", amountFen: n * 1000, pointsUnits: n * 100000 }))), uses: [] }, setData(v) { Object.assign(this.data, v); } };
  h.wx.request = (o) => o.success({ statusCode: 200, data: { items: [1, 2, 3].map((n) => ({ id: "t" + n, data: { cover: "https://cdn.test/" + n + ".jpg", title: "t", duration: 5 } })) } });
  await loadArt(page);
  assert.deepEqual([...page.data.products].map((p) => p.art.length), [1, 2, 3, 3]);
  assert.equal(page.data.heroArt.length, 3);
  assert.ok(page.data.useArt.video);
});

test("work notices pick up the work's own thumbnail; orders and unknown jobs stay icons", async () => {
  const h = harness();
  const { loadThumbs } = h.service("../pages/notifications/thumbs");
  const page = { data: { items: [{ data: { kind: "job", targetId: "j1" } }, { data: { kind: "job", targetId: "j9" } }, { data: { kind: "order", targetId: "o1" } }] }, setData(v) { Object.assign(this.data, v); } };
  await h.api.signIn();
  h.wx.request = (o) => o.success({ statusCode: 200, data: { items: [{ id: "j1", thumbnailUrl: "https://cdn.test/j1.jpg", input: { kind: "video" } }, { id: "o1", thumbnailUrl: "https://cdn.test/x.jpg", input: { kind: "video" } }], total: 2, page: 1, size: 30 } });
  await loadThumbs(page);
  assert.deepEqual(Object.keys(page.data.thumbs), ["j1"]);
});
