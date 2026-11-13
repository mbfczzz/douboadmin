const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("Agent reserves the actual navigation height on entry and after resize", () => {
  const h = harness(), page = h.page("agent");
  let top = 59, capsuleTop = 65;
  h.wx.getWindowInfo = () => ({ windowWidth: 393, statusBarHeight: top });
  h.wx.getMenuButtonBoundingClientRect = () => ({ left: 290, top: capsuleTop, height: 32 });
  page.load = async () => {};
  page.poll = () => {};
  page.setData({ prompt: "不要丢失编辑内容", messages: [{ id: "kept" }] });
  page.onShow();
  assert.equal(page.data.navBottom, 103);
  top = 24;
  capsuleTop = 32;
  page.onResize();
  assert.equal(page.data.navBottom, 72);
  top = 0;
  capsuleTop = 6;
  page.onResize();
  assert.equal(page.data.navBottom, 44);
  assert.equal(page.data.prompt, "不要丢失编辑内容");
  assert.equal(page.data.messages[0].id, "kept");
});

test("returning after a hidden resize keeps the navigation and Agent geometry in sync", () => {
  const h = harness(), page = h.page("agent"), nav = h.component("components/nav-bar");
  page.load = async () => {};
  page.poll = () => {};
  nav.lifetimes.attached.call(nav);
  page.onShow();
  assert.equal(nav.data.top + nav.data.height, page.data.navBottom);
  page.onHide();
  h.wx.getWindowInfo = () => ({ windowWidth: 430, statusBarHeight: 59 });
  h.wx.getMenuButtonBoundingClientRect = () => ({ left: 330, top: 67, height: 32 });
  nav.pageLifetimes.show.call(nav);
  page.onShow();
  assert.equal(nav.data.top + nav.data.height, page.data.navBottom);
  assert.equal(page.data.navBottom, 107);
});
