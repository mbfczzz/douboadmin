const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("the themed dialog resolves true only on confirm and never hangs", async () => {
  const h = harness(),
    dialog = h.component("components/ui-dialog");
  const first = dialog.open({ title: "删除这个作品？", tone: "danger" });
  assert.equal(dialog.data.visible, true);
  assert.equal(dialog.data.icon, "error-circle"); // danger gets a warning glyph
  const second = dialog.open({ title: "积分说明", showCancel: false });
  assert.equal(await first, false); // a replaced dialog settles as cancelled
  dialog.mask(); // no cancel button: tapping outside does nothing
  assert.equal(dialog.data.visible, true);
  dialog.confirm();
  assert.equal(await second, true);
  assert.equal(dialog.data.visible, false);
  const third = dialog.open({ title: "放弃修改？" });
  dialog.mask();
  assert.equal(await third, false);
  const fourth = dialog.open({ title: "x" });
  dialog.lifetimes.detached.call(dialog);
  assert.equal(await fourth, false);
});

test("ask() uses the page's dialog, else falls back to the native modal", async () => {
  const h = harness(),
    { ask } = h.service("dialog"),
    seen = [];
  h.pages.push({
    selectComponent: (id) => ({ open: async (o) => (seen.push([id, o.title, o.amount]), true) }),
  });
  assert.equal(await ask({ title: "本次将使用", amount: "120", unit: "积分" }), true);
  assert.deepEqual(seen, [["#ui-dialog", "本次将使用", "120"]]);
  h.pages.length = 0;
  let modal;
  h.wx.showModal = (o) => {
    modal = o;
    o.success({ confirm: false });
  };
  assert.equal(await ask({ title: "本次将使用", amount: "120", unit: "积分", content: "失败退回", tone: "danger" }), false);
  assert.equal(modal.content, "120 积分\n失败退回");
  assert.equal(modal.confirmColor, "#b42338");
  h.wx.showModal = async () => ({ confirm: true });
  assert.equal(await ask({ title: "x" }), true);
});
