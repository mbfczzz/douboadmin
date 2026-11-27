const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");
// 优秀作品 lives in a component shown inside the 模板 tab page; `visible`
// stands for the host's active flag.
const featured = (h) => { const c = h.component("components/featured-works"); c.self().visible = true; return c; };
const work = (id = "image") => ({ id, title: "优秀作品", kind: id === "video" ? "video" : "image", result: "https://fixture.test/1.png",
  results: id === "video" ? [] : [1, 2, 3, 4].map((n) => `https://fixture.test/${n}.png`), createdAt: "2026-11-15T00:00:00Z" });

test("featured pagination uses the shared compact horizontal layout", () => {
  const styles = fs.readFileSync("components/featured-works/index.wxss", "utf8");
  const template = fs.readFileSync("components/featured-works/index.wxml", "utf8");
  assert.match(styles, /@import "\.\.\/\.\.\/styles\/job-pagination\.wxss"/);
  assert.match(template, /class="job-pagination"/);
  assert.match(template, /第 \{\{page\}\} 页 · 共 \{\{total\}\} 个/);
});

test("featured videos use WeChat's adaptive native media viewer", async () => {
  const styles = fs.readFileSync("components/featured-works/index.wxss", "utf8");
  const template = fs.readFileSync("components/featured-works/index.wxml", "utf8");
  assert.doesNotMatch(template, /<video/);
  assert.doesNotMatch(styles, /featured-preview video[^}]*52vh/);
  const h = harness(), service = h.service("featured-works"), page = featured(h);
  let shown;
  h.wx.previewMedia = (options) => { shown = options; };
  service.featuredDetail = async () => work("video");
  await page.open({ currentTarget: { dataset: { id: "video" } } });
  assert.equal(shown.sources[0].type, "video");
  assert.equal(shown.sources[0].url, work("video").result);
  assert.equal(page.data.detail, null);
});

test("featured works display mixed media, filters and paginates without login", async () => {
  const h = harness(), service = h.service("featured-works"), page = featured(h);
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
  const h = harness(), service = h.service("featured-works"), page = featured(h);
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
  page.hide();
  release({ items: [], total: 0 });
  await pending;
  assert.equal(page.data.works[0].kind, "video");
});

test("public image previews retain all four results and close on withdrawal", async () => {
  const h = harness(), service = h.service("featured-works"), page = featured(h);
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
  const h = harness(), service = h.service("featured-works"), page = featured(h);
  let release;
  service.featuredDetail = () => new Promise((resolve) => { release = resolve; });
  const pending = page.open({ currentTarget: { dataset: { id: "video" } } });
  page.hide();
  release(work("video"));
  await pending;
  assert.equal(page.data.detail, null);
  assert.equal(page.data.opening, "");
});

test("my common functions open the 优秀 tab, not a new page", () => {
  const h = harness(), page = h.page("mine"), switches = [];
  h.wx.switchTab = (options) => switches.push(options);
  assert.ok(page.data.menus.some((item) => item.mode === "featured-works" && item.label === "优秀作品"));
  page.menu({ currentTarget: { dataset: { mode: "featured-works" } } });
  assert.equal(h.nav.length, 0);
  assert.equal(switches[0].url, "/pages/templates/index");
  assert.equal(h.service("../utils/featured-mode").featuredOn(), true);
});

test("page changes clear the previous page cards while the next page is loading", async () => {
  const h = harness(), service = h.service("featured-works"), page = featured(h);
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

test("coming back from a preview shows the list and popup as they were, without reloading", async () => {
  const h = harness(), service = h.service("featured-works"), page = featured(h);
  let calls = 0;
  service.featuredPage = async () => { calls++; return { items: [work()], total: 1 }; };
  service.featuredDetail = async () => work();
  page.show();
  await new Promise(setImmediate);
  await page.open({ currentTarget: { dataset: { id: "image" } } });
  page.hide(); // the native preview hides the page
  page.show();
  await new Promise(setImmediate);
  assert.equal(calls, 1, "no reload: the covers stay as they were");
  assert.equal(page.data.detail.id, "image", "the open popup stays");
  assert.equal(page.data.loading, false);
  // After a while the covers' signatures run out: the list loads again.
  page.hide();
  page.self().loaded.at -= 11 * 60 * 1000;
  page.show();
  await new Promise(setImmediate);
  assert.equal(calls, 2);
});

test("a refresh cut short by leaving runs again on return", async () => {
  const h = harness(), service = h.service("featured-works"), page = featured(h);
  let calls = 0, release;
  service.featuredPage = async () => { calls++; return { items: [work()], total: 1 }; };
  page.show();
  await new Promise(setImmediate);
  service.featuredPage = () => { calls++; return new Promise((resolve) => { release = resolve; }); };
  const pending = page.refresh();
  page.hide();
  release({ items: [], total: 0 });
  await pending;
  service.featuredPage = async () => { calls++; return { items: [work("video")], total: 1 }; };
  page.show();
  await new Promise(setImmediate);
  assert.equal(calls, 3);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.works[0].id, "video");
});
