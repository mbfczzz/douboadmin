const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("changing prompt privacy while preparing a share discards the obsolete response", async () => {
  const h = harness(),
    page = h.page("share");
  let finish;
  page.setData({
    job: { id: "job", reviewStatus: "approved" },
    showPrompt: true,
  });
  h.api.request = () => new Promise((resolve) => (finish = resolve));
  const pending = page.prepare();
  page.prompt({ detail: { value: false } });
  finish({ token: "exposes-old-prompt" });
  await pending;
  assert.equal(page.data.share, null);
  assert.equal(page.data.showPrompt, false);
  assert.equal(page.data.busy, false);
});

test("leaving the share page prevents a late response from writing UI", async () => {
  const h = harness(),
    page = h.page("share");
  let finish;
  page.setData({ job: { id: "job", reviewStatus: "approved" } });
  h.api.request = () => new Promise((resolve) => (finish = resolve));
  const pending = page.prepare();
  page.onUnload();
  page.setData = () => assert.fail("write after unload");
  finish({ token: "late" });
  await pending;
});

test("a signed-out share page clears the previous private work and link", async () => {
  const h = harness(),
    page = h.page("share");
  page.setData({ job: { id: "old" }, share: { token: "old" } });
  await page.load();
  assert.equal(page.data.job, null);
  assert.equal(page.data.share, null);
  assert.equal(page.data.needsLogin, true);
});
