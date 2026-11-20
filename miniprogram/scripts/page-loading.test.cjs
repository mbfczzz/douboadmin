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
  // 一键复刻: nothing to start until a video is chosen (so not while it is read).
  assert.match(read("pages/remake/index.wxml"), /<button wx:if="\{\{video\}\}" class="biz-action remake-start"/);
});

test("list skeletons carry the slow-network line; both appear late", () => {
  for (const page of ["tasks", "mine", "templates", "studio", "works", "notifications", "orders", "library", "wallet"])
    assert.match(read(`pages/${page}/index.wxml`), /<page-loading show mode="hint" \/>/, page);
  const css = read("components/page-loading/index.wxss");
  assert.match(css, /\.page-loading \{[^}]*animation: pl-in 200ms ease 250ms both/); // no flash on a fast load
  assert.match(css, /\.page-loading\.pl-hint \{[^}]*position: fixed[^}]*animation: pl-in 300ms ease 4s both/); // takes no room, shows when slow
  // Mode classes are prefixed: the app's own .page (side padding) must not reach the component.
  assert.doesNotMatch(read("components/page-loading/index.wxml"), /class="page-loading \{\{mode\}\}"/);
  assert.match(read("app.json"), /"page-loading": "\/components\/page-loading\/index"/);
});

test("sign-in, activation, sharing, extraction and the Agent picker wait visibly too", () => {
  assert.match(read("pages/activate/index.wxml"), /<page-loading wx:if="\{\{loading&&!status&&!loadError\}\}" show mode="inline"[^>]*\/>\s*<block wx:else>/);
  assert.match(read("pages/login/index.wxml"), /<page-loading wx:if="\{\{loading\}\}" show mode="inline" text="正在连接微信…"/);
  assert.match(read("pages/share/index.wxml"), /<page-loading show="\{\{!job&&!needsLogin&&!loadError\}\}"/);
  assert.match(read("pages/extract/index.wxml"), /<page-loading wx:if="\{\{busy&&!video&&item\.key==='link'\}\}"/);
  assert.match(read("components/featured-works/index.wxml"), /<page-loading show mode="hint" \/>/);
  const agent = read("pages/agent/index.wxml");
  assert.match(agent, /<page-loading wx:if="\{\{!session&&!projectsReady&&!projectsError\}\}"/);
  assert.match(agent, /wx:elif="\{\{!session&&projectsError\}\}" class="error-box" bindtap="retryProjects"/);
});

test("full-page loading outlines the page it loads", () => {
  const wxml = read("components/page-loading/index.wxml");
  for (const shape of ["list", "grid"]) assert.match(wxml, new RegExp(`shape==='${shape}'`));
  assert.match(wxml, /class="pl-s pl-media"/); // the default: a detail page's picture or video
  assert.doesNotMatch(read("components/page-loading/index.wxss"), /\.pl-dots view/, "tag selectors do not work in components");
  for (const page of ["profile", "preferences", "provider"]) assert.match(read(`pages/${page}/index.wxml`), /<page-loading[^>]*shape="list"/, page);
  assert.match(read("pages/hot-videos/index.wxml"), /<page-loading[^>]*shape="grid"/);
});
