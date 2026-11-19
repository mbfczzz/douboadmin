const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

const video = (id) => ({ id, title: "视频" + id, text: "", author: "作者", cover: "https://c/" + id, url: "", sourceUrl: "", likes: 12000, views: null, comments: null, publishedAt: "2026-11-01T00:00:00Z", duration: 10 });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function studio(signedIn = true) {
  const h = harness(), calls = [];
  h.api.hasSession = () => signedIn;
  h.api.request = async (path) => {
    if (path.startsWith("/hot")) calls.push(path);
    if (path.startsWith("/hot/discovery")) return { enabled: true, keywords: ["美食", "旅行"], source: "推荐关键词" };
    if (!path.includes("?")) return video(path.split("/").pop());
    const cursor = Number(/cursor=(\d+)/.exec(path)[1]);
    return { items: [video("a" + cursor), video("b" + cursor)], cursor: cursor + 2, hasMore: cursor === 0, searchId: "s", backtrace: "" };
  };
  h.api.tab = () => undefined;
  return { h, calls, page: h.page("studio") };
}

test("创作 is a tab page of entry cards; the editor and 混剪 are subpages", () => {
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  const tabs = app.tabBar.list.map((item) => item.pagePath);
  assert.ok(tabs.includes("pages/studio/index"));
  assert.ok(!tabs.includes("pages/create/index") && !tabs.includes("pages/mix/index"));
  const { h, page } = studio();
  const open = (key) => { page.open({ currentTarget: { dataset: { key } } }); h.api.resetNavigation(page); };
  for (const key of ["video", "image", "mix", "remake", "ad", "idphoto", "extract", "remix", "hot"]) open(key);
  assert.deepEqual(h.nav.map((n) => n.url), ["/pages/create/index?kind=video", "/pages/create/index?kind=image", "/pages/mix/index", "/pages/remake/index", "/pages/create/index?feature=ad", "/pages/create/index?feature=idphoto", "/pages/extract/index", "/pages/feature/index?key=remix", "/pages/hot-videos/index"]);
});

test("the feed lists the first keyword's videos without saving search history", async () => {
  const { calls, page } = studio();
  page.onShow();
  await settle();
  assert.deepEqual(Array.from(page.data.keywords), ["美食", "旅行"]);
  assert.equal(page.data.keyword, "美食");
  assert.match(calls[1], /^\/hot\/videos\?q=%E7%BE%8E%E9%A3%9F&cursor=0.*&history=0$/);
  assert.deepEqual(Array.from(page.data.videos, (v) => v.id), ["a0", "b0"]);
  assert.equal(page.data.videos[0].likesText, "1.2万");
  page.onReachBottom();
  await settle();
  assert.deepEqual(Array.from(page.data.videos, (v) => v.id), ["a0", "b0", "a2", "b2"]);
  assert.equal(page.data.hasMore, false);
  page.choose({ currentTarget: { dataset: { word: "旅行" } } });
  await settle();
  assert.equal(page.data.keyword, "旅行");
  assert.deepEqual(Array.from(page.data.videos, (v) => v.id), ["a0", "b0"]);
});

test("a visitor sees the keywords with a sign-in prompt, not a failed search", async () => {
  const { calls, page } = studio(false);
  page.onShow();
  await settle();
  assert.equal(page.data.feedState, "login");
  assert.deepEqual(calls, ["/hot/discovery"]);
});

test("做同款 opens 一键复刻 with the video; the remake page shows it", async () => {
  const { h, page } = studio();
  page.remake({ currentTarget: { dataset: { id: "v1" } } });
  assert.equal(h.nav[0].url, "/pages/remake/index?id=v1");
  const remake = h.page("remake"), toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  remake.onLoad({ id: "v1" });
  remake.onShow();
  await settle();
  assert.equal(remake.data.video.id, "v1");
  remake.start();
  assert.deepEqual(toasts, ["一键复刻即将开放"]);
});

test("图片创作 opens the editor on images", () => {
  const h = harness(), editor = h.page("create");
  editor.onLoad({ kind: "image" });
  assert.equal(editor.data.kind, "image");
  assert.equal(editor.data.ratio, "1:1");
});
