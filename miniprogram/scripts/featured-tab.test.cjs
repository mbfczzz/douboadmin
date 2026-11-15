const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

test("bottom navigation exposes featured works without exceeding native tab limits", () => {
  const h = harness(), bar = h.component("custom-tab-bar");
  assert.deepEqual(Array.from(bar.data.items, (item) => item.text), ["模板", "混剪", "创作", "Agent", "优秀", "我的"]);
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  assert.equal(app.tabBar.list.length, 5);
  assert.ok(app.pages.includes("pages/featured-works/index"));
  assert.ok(!app.tabBar.list.some((item) => item.pagePath === "pages/featured-works/index"));
  const config = JSON.parse(fs.readFileSync("pages/featured-works/index.json", "utf8"));
  assert.equal(config.usingComponents["app-tab-bar"], "/custom-tab-bar/index");
  assert.match(fs.readFileSync("pages/featured-works/index.wxml", "utf8"), /<app-tab-bar\s*\/>/);
});

test("featured tab navigates as a regular page, guards duplicate taps and restores selection", () => {
  const h = harness(), bar = h.component("custom-tab-bar"), switches = [];
  h.wx.switchTab = (options) => switches.push(options);
  const tap = (index) => bar.switchTab({ currentTarget: { dataset: { index } } });
  tap(4); tap(4);
  assert.equal(h.nav.length, 1);
  assert.equal(switches.length, 0);
  assert.equal(h.nav[0].url, "/pages/featured-works/index");
  h.nav[0].complete();
  h.pages.push({ route: "pages/featured-works/index" });
  bar.pageLifetimes.show.call(bar);
  assert.equal(bar.data.selected, 4);
  tap(4);
  assert.equal(h.nav.length, 1);
  tap(5);
  assert.equal(switches[0].url, "/pages/mine/index");
  switches[0].complete();
  h.pages[0].route = "pages/mine/index";
  bar.pageLifetimes.show.call(bar);
  assert.equal(bar.data.selected, 5);
});

test("mine lifecycle selects my tab instead of the newly inserted featured tab", () => {
  const h = harness(), bar = { data: { selected: 4 }, setData(value) { Object.assign(this.data, value); } };
  h.api.tab({ getTabBar: () => bar }, 4);
  assert.equal(bar.data.selected, 5);
  h.api.tab({ getTabBar: () => bar }, 2);
  assert.equal(bar.data.selected, 2);
});

test("failed featured navigation unlocks and shared openTab uses the same destination", () => {
  const h = harness(), bar = h.component("custom-tab-bar");
  bar.switchTab({ currentTarget: { dataset: { index: 4 } } });
  h.nav[0].fail();
  assert.equal(bar.data.switching, false);
  bar.switchTab({ currentTarget: { dataset: { index: 4 } } });
  assert.equal(h.nav.length, 2);
  const page = {};
  assert.equal(h.api.openTab(page, "/pages/featured-works/index"), true);
  assert.equal(h.api.openTab(page, "/pages/featured-works/index"), false);
  assert.equal(h.nav[2].url, "/pages/featured-works/index");
});
