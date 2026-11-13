const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

function menuFixture(height, bottom, count = 20, safeBottom = 0) {
  const h = harness();
  h.wx.getWindowInfo = () => ({
    windowHeight: height,
    windowWidth: 390,
    statusBarHeight: 24,
    screenHeight: height,
    safeArea: { bottom: height - safeBottom },
  });
  let measure;
  const query = {
    select() {
      return this;
    },
    boundingClientRect(callback) {
      measure = callback;
      return this;
    },
    exec() {},
  };
  h.wx.createSelectorQuery = () => query;
  const page = h.page("create");
  page.setData({
    modelsLoading: false,
    availableModels: Array.from({ length: count }, (_, id) => ({
      id: String(id),
    })),
  });
  return {
    page,
    measure: () => measure({ top: bottom - 300, bottom, height: 300 }),
  };
}

test("long model menus flip upward on short screens and stay inside the viewport", () => {
  const f = menuFixture(568, 500);
  f.page.showModels();
  f.measure();
  assert.equal(f.page.data.modelMenuUp, true);
  assert.equal(f.page.data.modelMenuHeight, 320);
  assert.ok(500 - 68 - f.page.data.modelMenuHeight >= 76);
});

test("a roomy screen retains the designed downward dropdown", () => {
  const f = menuFixture(1000, 438, 4);
  f.page.showModels();
  f.measure();
  assert.equal(f.page.data.modelMenuUp, false);
  assert.equal(f.page.data.modelMenuHeight, 238);
});

test("model menus reserve the custom tab bar as well as the home indicator", () => {
  const f = menuFixture(844, 580, 20, 34);
  f.page.showModels();
  f.measure();
  assert.equal(f.page.data.modelMenuUp, true);
  assert.ok(580 - 68 - f.page.data.modelMenuHeight >= 76);
  const down = menuFixture(844, 420, 20, 34);
  down.page.showModels();
  down.measure();
  assert.equal(down.page.data.modelMenuUp, false);
  assert.ok(420 - 12 + down.page.data.modelMenuHeight <= 844 - 34 - 70 - 12);
});

test("late measurement cannot reopen a dismissed or hidden menu", () => {
  const f = menuFixture(568, 438);
  f.page.showModels();
  f.page.closeModels();
  f.measure();
  assert.equal(f.page.data.showModels, false);
  assert.equal(f.page.data.modelMenuUp, false);
  f.page.showModels();
  f.page.onHide();
  f.measure();
  assert.equal(f.page.data.modelMenuUp, false);
});

test("navigation uses a safe height for an empty capsule measurement", () => {
  const h = harness();
  h.wx.getWindowInfo = () => ({ windowWidth: 390, statusBarHeight: 24 });
  h.wx.getMenuButtonBoundingClientRect = () => ({ left: 0, top: 0, height: 0 });
  const nav = h.component("components/nav-bar");
  nav.measure();
  assert.equal(nav.data.height, 44);
  assert.equal(nav.data.actionsRight, 88);
});

test("resizing dismisses stale menu geometry without changing the draft", () => {
  const f = menuFixture(568, 438);
  f.page.setData({ prompt: "保留的创作内容", model: "chosen" });
  f.page.showModels();
  f.page.onResize();
  f.measure();
  assert.equal(f.page.data.showModels, false);
  assert.equal(f.page.data.prompt, "保留的创作内容");
  assert.equal(f.page.data.model, "chosen");
});

test("navigation updates capsule spacing after resize and accepts a zero status bar", () => {
  const h = harness();
  h.wx.getWindowInfo = () => ({ windowWidth: 390, statusBarHeight: 0 });
  h.wx.getMenuButtonBoundingClientRect = () => ({
    left: 300,
    top: 8,
    height: 32,
  });
  const nav = h.component("components/nav-bar");
  nav.pageLifetimes.resize.call(nav);
  assert.equal(nav.data.top, 0);
  assert.equal(nav.data.height, 48);
  assert.equal(nav.data.actionsRight, 98);
});

test("the model menu opens straight into its measured place the second time", () => {
  const f = menuFixture(568, 500);
  f.page.showModels();
  f.measure();
  assert.equal(f.page.data.modelMenuUp, true);
  const height = f.page.data.modelMenuHeight;
  f.page.closeModels();
  f.page.showModels(); // no measurement yet: remembered geometry, no jump
  assert.equal(f.page.data.modelMenuUp, true);
  assert.equal(f.page.data.modelMenuHeight, height);
});

test("measuring before the models load still opens the menu at the right height", () => {
  const f = menuFixture(1000, 438, 0);
  f.page.onReady(); // models not loaded yet
  f.measure();
  f.page.setData({ availableModels: Array.from({ length: 4 }, (_, id) => ({ id: String(id) })) });
  f.page.showModels();
  assert.equal(f.page.data.modelMenuHeight, 4 * 56 + 14); // not clamped to 44
  assert.equal(f.page.data.modelMenuUp, false);
});
