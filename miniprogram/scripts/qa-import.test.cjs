const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
test("an import failure after leaving the page must not update its UI", async () => {
  const h = harness(),
    page = h.page("hot-detail");
  let reject;
  page.onLoad({ id: "123" });
  page.setData({ video: { text: "视频" } });
  h.api.request = () => new Promise((_, no) => (reject = no));
  const pending = page.use();
  page.onUnload();
  page.setData = () => assert.fail("write after unload");
  reject(Error("offline"));
  await pending;
});
