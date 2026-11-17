const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

// 优秀 is a sixth tab, but the native tab bar holds five pages: it is the 模板
// tab page's featured view, so selecting it is a tab switch, not a new page.
test("bottom navigation shows 优秀 as a view of the 模板 tab page", () => {
  const h = harness(), bar = h.component("custom-tab-bar");
  assert.deepEqual(Array.from(bar.data.items, (item) => item.text), ["模板", "优秀", "创作", "Agent", "我的"]);
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  assert.equal(app.tabBar.list.length, 5);
  assert.ok(!app.tabBar.list.some((item) => item.pagePath === "pages/featured-works/index"));
  const templates = fs.readFileSync("pages/templates/index.wxml", "utf8");
  assert.match(templates, /<view class="\{\{featured\?'':'view-off'\}\}"><featured-works id="featured" active="\{\{featured&&shown\}\}" \/><\/view>/);
  assert.match(templates, /class="page templates-page \{\{featured\?'view-off':''\}\}"/);
  assert.equal(JSON.parse(fs.readFileSync("pages/templates/index.json", "utf8")).usingComponents["featured-works"], "/components/featured-works/index");
});

test("tapping 优秀 switches tabs (no new page), guards repeats and selects 优秀", () => {
  const h = harness(), bar = h.component("custom-tab-bar"), switches = [];
  const mode = h.service("../utils/featured-mode");
  h.wx.switchTab = (options) => switches.push(options);
  const tap = (index) => bar.switchTab({ currentTarget: { dataset: { index } } });
  h.pages.push({ route: "pages/mine/index" });
  bar.setData({ selected: 4 });
  tap(1); tap(1);
  assert.equal(h.nav.length, 0, "never opens a new page");
  assert.equal(switches.length, 1);
  assert.equal(switches[0].url, "/pages/templates/index");
  assert.equal(mode.featuredOn(), true);
  switches[0].complete();
  h.pages[0].route = "pages/templates/index";
  bar.pageLifetimes.show.call(bar);
  assert.equal(bar.data.selected, 1);
});

test("on the 模板 page, 模板 and 优秀 swap its view in place", () => {
  const h = harness(), bar = h.component("custom-tab-bar"), switches = [], views = [];
  const mode = h.service("../utils/featured-mode");
  h.wx.switchTab = (options) => switches.push(options);
  h.pages.push({ route: "pages/templates/index", applyTabView: () => views.push(mode.featuredOn()) });
  const tap = (index) => bar.switchTab({ currentTarget: { dataset: { index } } });
  tap(1);
  assert.deepEqual(views, [true]);
  assert.equal(bar.data.selected, 1);
  tap(0);
  assert.deepEqual(views, [true, false]);
  assert.equal(bar.data.selected, 0);
  assert.equal(switches.length, 0, "no reload of the page it is already on");
});

test("tab lifecycles select the right tab, including the featured view", () => {
  const h = harness(), bar = { data: { selected: 1 }, setData(value) { Object.assign(this.data, value); } };
  const mode = h.service("../utils/featured-mode");
  h.api.tab({ getTabBar: () => bar }, 4);
  assert.equal(bar.data.selected, 4);
  h.api.tab({ getTabBar: () => bar }, 2);
  assert.equal(bar.data.selected, 2);
  mode.setFeatured(true);
  h.api.tab({ getTabBar: () => bar }, 0);
  assert.equal(bar.data.selected, 1);
  mode.setFeatured(false);
  h.api.tab({ getTabBar: () => bar }, 0);
  assert.equal(bar.data.selected, 0);
});

test("a failed switch unlocks, and openTab takes 优秀 to the same tab page", () => {
  const h = harness(), bar = h.component("custom-tab-bar"), switches = [];
  h.wx.switchTab = (options) => switches.push(options);
  h.pages.push({ route: "pages/agent/index" });
  bar.switchTab({ currentTarget: { dataset: { index: 1 } } });
  switches[0].fail();
  switches[0].complete();
  assert.equal(bar.data.switching, false);
  assert.equal(h.api.openTab({}, "/pages/featured-works/index"), true);
  // 混剪 is hidden from the bar; its page selects no tab.
  h.api.tab({ getTabBar: () => bar }, 1);
  assert.equal(bar.data.selected, -1);
  assert.equal(switches.at(-1).url, "/pages/templates/index");
});
