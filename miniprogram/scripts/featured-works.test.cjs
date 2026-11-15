const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const work = (id = "image") => ({ id, title: "优秀作品", kind: id === "video" ? "video" : "image", result: "https://fixture.test/1.png",
  results: id === "video" ? [] : [1, 2, 3, 4].map((n) => `https://fixture.test/${n}.png`), createdAt: "2026-11-15T00:00:00Z" });

test("featured page displays mixed media, filters and paginates without login", async () => {
  const h = harness(), service = h.service("featured-works"), page = h.page("featured-works");
  const calls = [];
  service.featuredPage = async (number, kind) => { calls.push([number, kind]); return { items: [work(), work("video")], total: 25 }; };
  await page.load();
  assert.equal(page.data.works.length, 2);
  assert.equal(page.data.works[1].kind, "video");
  page.next();
  await new Promise(setImmediate);
  assert.deepEqual(calls.at(-1), [2, ""]);
  page.choose({ currentTarget: { dataset: { kind: "image" } } });
  await new Promise(setImmediate);
  assert.deepEqual(calls.at(-1), [1, "image"]);
  assert.equal(h.loginCount(), 0);
});

test("late featured lists cannot overwrite a newer filter or a hidden page", async () => {
  const h = harness(), service = h.service("featured-works"), page = h.page("featured-works");
  let release;
  service.featuredPage = () => new Promise((resolve) => { release = resolve; });
  const first = page.load();
  service.featuredPage = async () => ({ items: [work("video")], total: 1 });
  page.choose({ currentTarget: { dataset: { kind: "video" } } });
  await new Promise(setImmediate);
  release({ items: [work()], total: 99 });
  await first;
  assert.equal(page.data.works[0].kind, "video");
  service.featuredPage = () => new Promise((resolve) => { release = resolve; });
  const pending = page.load();
  page.onHide();
  release({ items: [], total: 0 });
  await pending;
  assert.equal(page.data.works[0].kind, "video");
});

test("public image previews retain all four results and close on withdrawal", async () => {
  const h = harness(), service = h.service("featured-works"), page = h.page("featured-works");
  service.featuredDetail = async () => work();
  service.featuredPage = async () => ({ items: [], total: 0 });
  await page.open({ currentTarget: { dataset: { id: "image" } } });
  assert.equal(page.data.detail.results.length, 4);
  let shown;
  h.wx.previewImage = (value) => { shown = value; };
  await page.preview({ detail: { index: 2 } });
  assert.equal(shown.current, work().results[2]);
  assert.equal(shown.urls.length, 4);
  service.featuredDetail = async () => { throw new Error("作品已下架"); };
  await page.preview({ detail: { index: 0 } });
  assert.equal(page.data.detail, null);
});

test("late detail responses cannot open a popup after leaving", async () => {
  const h = harness(), service = h.service("featured-works"), page = h.page("featured-works");
  let release;
  service.featuredDetail = () => new Promise((resolve) => { release = resolve; });
  const pending = page.open({ currentTarget: { dataset: { id: "video" } } });
  page.onHide();
  release(work("video"));
  await pending;
  assert.equal(page.data.detail, null);
  assert.equal(page.data.opening, "");
});

test("my common functions link to the featured works page", () => {
  const h = harness(), page = h.page("mine");
  assert.ok(page.data.menus.some((item) => item.mode === "featured-works" && item.label === "优秀作品"));
  page.menu({ currentTarget: { dataset: { mode: "featured-works" } } });
  assert.equal(h.nav[0].url, "/pages/featured-works/index");
});

test("page changes clear the previous page cards while the next page is loading", async () => {
  const h = harness(), service = h.service("featured-works"), page = h.page("featured-works");
  service.featuredPage = async () => ({ items: [work()], total: 25 });
  await page.load();
  let release;
  service.featuredPage = () => new Promise((resolve) => { release = resolve; });
  page.next();
  assert.equal(page.data.page, 2);
  assert.equal(page.data.works.length, 0);
  release({ items: [work("video")], total: 25 });
  await new Promise(setImmediate);
  assert.equal(page.data.works[0].id, "video");
});
