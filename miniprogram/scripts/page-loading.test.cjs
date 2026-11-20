const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (f) => fs.readFileSync(f, "utf8");

// Slow first loads: detail pages show the loading page (not empty boxes and a
// disabled button); list skeletons get the slow-network line.
test("detail pages wait on the loading page, with what is being loaded", () => {
  const pages = { remake: "抖音视频", "hot-detail": "视频详情", "shared-work": "作品", "task-detail": "作品", "template-detail": "模板", profile: "资料", provider: "推广码", preferences: "设置", "hot-videos": "抖音视频" };
  for (const [page, words] of Object.entries(pages)) {
    const wxml = read(`pages/${page}/index.wxml`);
    assert.match(wxml, new RegExp(`<page-loading [^>]*text="[^"]*${words}`), page);
    assert.doesNotMatch(wxml, /class="skeleton skel-hero"|class="hero skeleton"/, page);
  }
  // 一键复刻: nothing to start while the video is still being read.
  assert.match(read("pages/remake/index.wxml"), /<button wx:if="\{\{!\(loading&&!video\)\}\}" class="biz-action remake-start"/);
});

test("list skeletons carry the slow-network line; both appear late", () => {
  for (const page of ["tasks", "mine", "templates", "studio", "works", "notifications", "orders", "library", "wallet"])
    assert.match(read(`pages/${page}/index.wxml`), /<page-loading show mode="hint" \/>/, page);
  const css = read("components/page-loading/index.wxss");
  assert.match(css, /\.page-loading \{[^}]*animation: pl-in 200ms ease 250ms both/); // no flash on a fast load
  assert.match(css, /\.page-loading\.hint \{[^}]*position: fixed[^}]*animation: pl-in 300ms ease 4s both/); // takes no room, shows when slow
  assert.match(read("app.json"), /"page-loading": "\/components\/page-loading\/index"/);
});
