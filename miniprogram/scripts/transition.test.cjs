const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

function setup() {
  let now = 0,
    sequence = 0;
  const pending = new Map();
  const h = harness({
    setTimeout(fn, delay) {
      const id = ++sequence;
      pending.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  });
  const switches = [];
  h.wx.switchTab = (options) => switches.push(options);
  const tick = (duration) => {
    now += duration;
    for (const [id, timer] of [...pending]) {
      if (timer.at <= now) {
        pending.delete(id);
        timer.fn();
      }
    }
  };
  return { h, tick, switches, pending };
}

test("queue to creation displays the transition page before switching tabs", () => {
  const { h, tick, switches } = setup();
  h.page("tasks").create();
  assert.equal(switches.length, 0);
  assert.match(h.nav[0].url, /^\/pages\/transition\/index\?target=/);
  const page = h.page("transition");
  page.onLoad({ target: h.nav[0].url.split("target=")[1] });
  page.onShow();
  tick(1000);
  assert.equal(
    switches.length,
    0,
    "must wait for the intermediate screen to render",
  );
  page.onReady();
  assert.equal(page.data.targetLabel, "创作");
  tick(599);
  assert.equal(switches.length, 0);
  tick(1);
  assert.equal(switches.length, 1);
  assert.equal(switches[0].url, "/pages/create/index");
  tick(2000);
  assert.equal(switches.length, 1);
});

test("leaving or backing out cancels the scheduled switch", () => {
  const { h, tick, switches, pending } = setup();
  const page = h.page("transition");
  page.onLoad({ target: "/pages/create/index" });
  page.onShow();
  page.onReady();
  tick(300);
  page.onHide();
  tick(1000);
  assert.equal(switches.length, 0);
  assert.equal(pending.size, 0);
  page.onShow();
  tick(599);
  assert.equal(switches.length, 0);
  page.onUnload();
  tick(1000);
  assert.equal(switches.length, 0);
});

test("failed target navigation offers retry without duplicate switches", () => {
  const { h, tick, switches } = setup();
  const page = h.page("transition");
  page.onLoad({ target: "/pages/create/index" });
  page.onShow();
  page.onReady();
  tick(600);
  switches[0].fail();
  assert.ok(page.data.error);
  assert.equal(page.data.navigating, false);
  page.retry();
  page.retry();
  assert.equal(page.data.error, "");
  tick(600);
  assert.equal(switches.length, 2);
});

test("an invalid target cannot route outside the configured tab pages", () => {
  for (const target of [
    "https://example.com",
    "/pages/login/index",
    "%invalid",
  ]) {
    const { h, tick, switches } = setup();
    const page = h.page("transition");
    page.onLoad({ target });
    page.onShow();
    page.onReady();
    tick(2000);
    assert.equal(page.data.valid, false);
    assert.ok(page.data.error);
    assert.equal(switches.length, 0);
  }
});

test("editing a work preserves the draft while opening the intermediate screen", () => {
  const { h, switches } = setup();
  const detail = h.page("task-detail");
  detail.setData({
    job: {
      input: { kind: "video", prompt: "keep draft", assets: ["asset-1"] },
    },
  });
  detail.edit();
  assert.equal(h.storage.get("edit-draft").prompt, "keep draft");
  assert.equal(switches.length, 0);
  assert.match(h.nav[0].url, /transition/);
});

test("ordinary tab controls switch immediately without an intermediate screen", () => {
  const { h, switches } = setup();
  const bar = h.component("custom-tab-bar");
  bar.switchTab({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(switches.length, 1);
  assert.equal(switches[0].url, "/pages/create/index");
  assert.equal(h.nav.length, 0);
});
