const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// 视频详情 leads to 一键复刻 with this video, not to 混剪.
test("视频详情's action opens 一键复刻 for the same video", () => {
  const h = harness(), page = h.page("hot-detail");
  page.onLoad({ id: "7301" });
  page.setData({ video: { text: "视频" } });
  page.remake();
  assert.equal(h.nav[0].url, "/pages/remake/index?id=7301");
  const wxml = require("node:fs").readFileSync("pages/hot-detail/index.wxml", "utf8");
  assert.match(wxml, /bindtap="remake">一键复刻</);
  assert.doesNotMatch(wxml, /混剪/);
});
