const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// Typing searches after a pause, across every category; picking a tab
// leaves search and returns to that category.
test("template search runs while typing, spans categories and clears on a tab", async () => {
  const timers = [];
  const h = harness({ setTimeout: (fn) => (timers.push(fn), timers.length), clearTimeout() {} });
  const urls = [];
  h.wx.request = (o) => {
    urls.push(new URL(o.url));
    o.success({ statusCode: 200, data: { items: [], total: 0, page: 1, size: 10 } });
  };
  const page = h.page("templates");
  page.onLoad();
  page.setData({ category: "万科物业专项", categories: ["推荐", "万科物业专项"] });
  page.input({ detail: { value: "社区 宣传 " } });
  assert.equal(page.data.search, "社区 宣传 ", "typed spaces stay in the box");
  timers.at(-1)();
  await new Promise(setImmediate);
  const searched = urls.filter((u) => u.pathname.endsWith("/templates")).at(-1);
  assert.equal(searched.searchParams.get("q"), "社区 宣传");
  assert.equal(searched.searchParams.get("category"), "推荐");
  page.choose({ currentTarget: { dataset: { value: "万科物业专项" } } });
  await new Promise(setImmediate);
  const browsed = urls.filter((u) => u.pathname.endsWith("/templates")).at(-1);
  assert.equal(page.data.search, "");
  assert.equal(browsed.searchParams.get("category"), "万科物业专项");
  assert.equal(browsed.searchParams.get("q"), "");
});
