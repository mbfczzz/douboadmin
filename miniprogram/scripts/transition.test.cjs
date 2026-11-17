const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("queue to creation switches directly without an extra page or delay", () => {
  const h = harness(), calls = [];
  h.wx.switchTab = (options) => calls.push(options);
  const page = h.page("tasks");
  page.create();
  page.create();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/pages/create/index");
  assert.equal(h.nav.length, 0);
});

test("failed tab shortcuts unlock for retry and retain their callback", () => {
  const h = harness(), calls = [], page = {};
  h.wx.switchTab = (options) => calls.push(options);
  let failures = 0;
  assert.equal(h.api.openTab(page, "/pages/create/index", () => failures++), true);
  calls[0].fail({ errMsg: "unavailable" });
  assert.equal(failures, 1);
  assert.equal(h.api.openTab(page, "/pages/create/index"), true);
  assert.equal(calls.length, 2);
});

test("a late old failure cannot unlock a newer route from the same page", () => {
  const h = harness(), page = {}, calls = [];
  h.wx.switchTab = (options) => calls.push(options);
  h.api.openTab(page, "/pages/create/index");
  h.api.resetNavigation(page);
  h.api.openTab(page, "/pages/mine/index");
  calls[0].fail({ errMsg: "old failure" });
  assert.equal(h.api.isNavigating(page), true);
  assert.equal(h.api.openTab(page, "/pages/create/index"), false);
  calls[1].fail({ errMsg: "current failure" });
  assert.equal(h.api.isNavigating(page), false);
});

test("invalid tab destinations cannot trigger navigation", () => {
  const h = harness(), calls = [];
  h.wx.switchTab = (options) => calls.push(options);
  for (const target of ["https://example.com", "/pages/login/index", "%invalid"])
    assert.equal(h.api.openTab({}, target), false);
  assert.equal(calls.length, 0);
  assert.equal(h.nav.length, 0);
});

test("editing a work preserves the draft while switching straight to creation", () => {
  const h = harness(), calls = [], detail = h.page("task-detail");
  h.wx.switchTab = (options) => calls.push(options);
  detail.setData({ job: { input: { kind: "video", prompt: "keep draft", assets: ["asset-1"] } } });
  detail.edit();
  assert.equal(h.storage.get("edit-draft").prompt, "keep draft");
  assert.equal(calls[0].url, "/pages/create/index");
  assert.equal(h.nav.length, 0);
});

test("tab selection follows the actual route and recovers from synchronous failure", () => {
  const h = harness(), bar = h.component("custom-tab-bar");
  h.pages.push({ route: "pages/mine/index" });
  bar.pageLifetimes.show.call(bar);
  assert.equal(bar.data.selected, 4);
  h.wx.switchTab = () => { throw new Error("busy"); };
  bar.switchTab({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(bar.data.switching, false);
  assert.equal(bar.data.selected, 4);
  h.pages[0].route = "pages/create/index";
  bar.pageLifetimes.show.call(bar);
  assert.equal(bar.data.selected, 2);
});

test("tab selection is applied when the native component becomes available late", () => {
  const h = harness(), page = h.page("create");
  let ready;
  page.getTabBar = (callback) => { ready = callback; return null; };
  h.api.tab(page, 2);
  const bar = { data: { selected: 0 }, setData(value) { Object.assign(this.data, value); } };
  ready(bar);
  assert.equal(bar.data.selected, 2);
});
