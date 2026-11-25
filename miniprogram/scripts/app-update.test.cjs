const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

function fixture() {
  const h = harness();
  let ready, applied = 0;
  const modals = [];
  h.wx.getUpdateManager = () => ({
    onUpdateReady: (fn) => { ready = fn; },
    applyUpdate: () => { applied++; },
  });
  h.wx.showModal = (options) => { modals.push(options); };
  h.app().onLaunch();
  return { ready: () => ready(), modals, applied: () => applied };
}

test("a downloaded production update prompts and restarts on confirm", () => {
  const f = fixture();
  f.ready();
  assert.equal(f.modals.length, 1);
  assert.equal(f.modals[0].title, "版本更新");
  assert.equal(f.modals[0].confirmText, "立即更新");
  f.modals[0].success({ confirm: true, cancel: false });
  assert.equal(f.applied(), 1);
});

test("postponing an update keeps the current session", () => {
  const f = fixture();
  f.ready();
  f.modals[0].success({ confirm: false, cancel: true });
  assert.equal(f.applied(), 0);
});

test("old base libraries without UpdateManager continue launching", () => {
  const h = harness();
  h.wx.getUpdateManager = undefined;
  assert.doesNotThrow(() => h.app().onLaunch());
});
