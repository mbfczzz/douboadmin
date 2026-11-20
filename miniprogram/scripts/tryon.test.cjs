const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const plain = (v) => JSON.parse(JSON.stringify(v)); // values made inside the sandbox
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const outfit = (id, extra = {}) => ({ id, title: "服装" + id, category: "春季", description: "白T + 牛仔裤", image: "https://oss/" + id + ".jpg", ...extra });

function tryon(reply) {
  const h = harness(), calls = [];
  h.api.request = async (path, method) => {
    calls.push([path, method || "GET"]);
    return reply(path, method);
  };
  const page = h.page("tryon");
  page.onLoad();
  return { h, page, calls };
}

test("AI试衣 lists the library by category and order, a page at a time", async () => {
  const { page, calls } = tryon((path) => {
    if (path === "/outfits/categories") return [{ name: "春季", count: 21 }, { name: "夏季", count: 3 }];
    const n = /page=2/.test(path) ? 21 : 1;
    return { items: Array.from({ length: n === 1 ? 20 : 1 }, (_, i) => outfit(String(n + i))), total: 21 };
  });
  page.onShow();
  await settle();
  assert.deepEqual(calls.map((c) => c[0]), ["/outfits/categories", "/outfits?page=1&size=20&sort=&category="]);
  assert.equal(page.data.allCount, 24);
  assert.equal(page.data.outfits.length, 20);
  assert.equal(page.data.galleryLoading, false);
  page.onReachBottom();
  await settle();
  assert.equal(page.data.outfits.length, 21);
  page.onReachBottom(); // all 21 shown: no more requests
  page.chooseCategory({ currentTarget: { dataset: { name: "夏季" } } });
  await settle();
  assert.equal(calls.at(-1)[0], "/outfits?page=1&size=20&sort=&category=%E5%A4%8F%E5%AD%A3");
  assert.equal(calls.length, 4);
  page.onShow(); // coming back keeps the list
  assert.equal(calls.length, 4);
});

test("a failed page says so and retries; an empty library points to uploading", async () => {
  let fail = true;
  const { page } = tryon((path) => {
    if (path === "/outfits/categories") return [];
    if (fail) throw new Error("网络不可用");
    return { items: [], total: 0 };
  });
  page.onShow();
  await settle();
  assert.equal(page.data.galleryError, "网络不可用");
  fail = false;
  page.retryGallery();
  await settle();
  assert.equal(page.data.galleryError, "");
  assert.equal(page.data.outfits.length, 0);
  const wxml = require("node:fs").readFileSync("pages/tryon/index.wxml", "utf8");
  assert.match(wxml, /暂无服装，也可以在「试穿」里上传自己的服装图/);
});

test("收藏 keeps ids on the phone, reads them back in order and drops removed outfits", async () => {
  const { h, page, calls } = tryon((path) => {
    if (path.includes("ids=")) return { items: [outfit("b")], total: 1 };
    return { items: [outfit("a"), outfit("b")], total: 2 };
  });
  page.favorite({ currentTarget: { dataset: { id: "a" } } }); // nothing loaded yet: ignored
  assert.deepEqual(plain(h.storage.get("tryon-favorites")), []);
  page.onShow();
  await settle();
  page.favorite({ currentTarget: { dataset: { id: "a" } } });
  page.favorite({ currentTarget: { dataset: { id: "b" } } });
  assert.deepEqual(plain(h.storage.get("tryon-favorites")), ["b", "a"]);
  assert.equal(page.data.favored.a, true);
  page.switchTab({ currentTarget: { dataset: { key: "favorites" } } });
  await settle();
  assert.match(calls.at(-1)[0], /ids=b,a$/);
  // "a" was taken down: it leaves 收藏 and the phone's list.
  assert.deepEqual(plain(page.data.favorites.map((o) => o.id)), ["b"]);
  assert.deepEqual(plain(h.storage.get("tryon-favorites")), ["b"]);
  page.favorite({ currentTarget: { dataset: { id: "b" } } });
  assert.deepEqual(plain(page.data.favorites), []);
  assert.equal(page.data.favored.b, undefined);
});

test("随机一个 previews an outfit; 试穿这件 takes it to 试穿", async () => {
  const { page, calls } = tryon((path) => (path.startsWith("/outfits/random") ? outfit("r") : path === "/outfits/categories" ? [] : { items: [], total: 0 }));
  page.onShow();
  page.chooseCategory({ currentTarget: { dataset: { name: "春季" } } });
  await settle();
  page.random();
  await settle();
  assert.equal(calls.at(-1)[0], "/outfits/random?category=%E6%98%A5%E5%AD%A3");
  assert.equal(page.data.preview.id, "r");
  page.wear({ currentTarget: { dataset: { id: "r" } } });
  assert.equal(page.data.tab, "fit");
  assert.equal(page.data.preview, null);
  assert.deepEqual(plain(page.data.garment), { outfit: "r", url: "https://oss/r.jpg", title: "服装r", description: "白T + 牛仔裤" });
});

test("开始试穿 needs both pictures, then hands the person and the outfit to the editor", async () => {
  const { h, page, calls } = tryon((path, method) => (method === "POST" ? { id: "own-asset" } : path === "/outfits/categories" ? [] : { items: [outfit("o")], total: 1 }));
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  await page.startFitting();
  assert.deepEqual(toasts, ["请先上传人物照片"]);
  h.api.chooseMediaFile = async () => ({ path: "tmp/me.jpg", name: "me.jpg" });
  h.api.upload = async () => ({ id: "person", data: { url: "https://oss/me.jpg", type: "image/jpeg" } });
  await page.choosePerson();
  assert.deepEqual(plain(page.data.person), { id: "person", url: "https://oss/me.jpg" });
  await page.startFitting();
  assert.equal(toasts[1], "请先选一件服装");
  page.onShow();
  await settle();
  page.wear({ currentTarget: { dataset: { id: "o" } } });
  await page.startFitting();
  assert.deepEqual(calls.at(-1), ["/outfits/o/use", "POST"]);
  const draft = h.storage.get("edit-draft");
  assert.deepEqual(plain(draft.assets), ["person", "own-asset"]);
  assert.equal(draft.kind, "image");
  assert.match(draft.prompt, /^让@图片1中的人物换穿@图片2中的服装（服装o：白T \+ 牛仔裤）。[^]*保留原照片的背景与光线/);
  assert.equal(h.nav.at(-1).url, "/pages/create/index?feature=tryon");
  assert.equal(page.data.starting, false);
  // An uploaded outfit is used as it is; without the background kept the studio one is asked for.
  h.api.upload = async () => ({ id: "dress", data: { url: "https://oss/d.jpg", type: "image/jpeg" } });
  await page.uploadGarment();
  page.toggleBackground();
  const before = calls.length;
  await page.startFitting();
  assert.equal(calls.length, before);
  assert.deepEqual(plain(h.storage.get("edit-draft").assets), ["person", "dress"]);
  assert.match(h.storage.get("edit-draft").prompt, /换穿@图片2中的服装。[^]*影棚背景/);
});

test("the AI试衣 preset needs the person and the outfit", () => {
  const h = harness();
  const page = h.page("create");
  page.onLoad({ feature: "tryon" });
  assert.equal(page.data.featureTitle, "AI试衣");
  assert.equal(page.data.kind, "image");
  const { featureProblem } = h.service("../pages/create/feature");
  assert.equal(featureProblem({ ...page.data, assets: [{ isImage: true }] }), "请放入人物照片和服装图各一张");
  assert.equal(featureProblem({ ...page.data, assets: [{ isImage: true }, { isImage: true }] }), "");
});
