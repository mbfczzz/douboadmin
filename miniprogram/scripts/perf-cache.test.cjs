const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("config is fetched once for concurrent pages, reused while fresh, forced on demand", async () => {
  const h = harness();
  await h.api.signIn();
  let calls = 0;
  h.api.request = async (path) => (assert.equal(path, "/config"), ++calls, { models: [], categories: ["推荐", "美食"] });
  const cache = h.service("../utils/config-cache");
  const [a, b] = await Promise.all([cache.loadConfig(), cache.loadConfig()]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await cache.loadConfig();
  assert.equal(calls, 1); // fresh copy reused
  await cache.loadConfig(true);
  assert.equal(calls, 2); // the create page forces a refresh
  assert.deepEqual([...cache.peekConfig().categories], ["推荐", "美食"]);
});

test("last-seen views belong to one account, expire, and keep shown image URLs", async () => {
  const h = harness();
  await h.api.signIn();
  const view = h.service("../utils/view-cache");
  view.writeView("mine", { n: 1 });
  assert.deepEqual({ ...view.readView("mine", 60000) }, { n: 1 });
  assert.equal(view.readView("mine", -1), undefined); // too old to show
  const other = harness(); // another launch, signed out: nothing leaks
  other.storage.set("view-cache:mine", h.storage.get("view-cache:mine"));
  assert.equal(other.service("../utils/view-cache").readView("mine", 60000), undefined);
  const shown = view.keepImages([], [{ id: "a", thumbnailUrl: "https://x/a?sig=1" }]); // arrives now
  const kept = view.keepImages(
    shown,
    [{ id: "a", thumbnailUrl: "https://x/a?sig=2" }, { id: "b", thumbnailUrl: "https://x/b?sig=2" }],
  );
  assert.deepEqual([...kept].map((r) => r.thumbnailUrl), ["https://x/a?sig=1", "https://x/b?sig=2"]);
  view.rememberRows([{ id: "t1", data: { title: "海边" } }]);
  assert.equal(view.recallRow("t1").data.title, "海边");
});

test("logging out removes cached profile, works and config from storage", async () => {
  const h = harness();
  await h.api.signIn();
  h.storage.set("view-cache:mine", { owner: "u", at: 1, value: {} });
  h.storage.set("config-cache", { owner: "u", at: 1, value: {} });
  h.storage.set("analytics-device", "d1");
  h.wx.request = (o) => o.success({ statusCode: 200, data: {} });
  h.wx.getStorageInfoSync = () => ({ keys: [...h.storage.keys()] });
  await h.api.logout();
  assert.equal(h.storage.has("view-cache:mine"), false);
  assert.equal(h.storage.has("config-cache"), false);
  assert.equal(h.storage.get("analytics-device"), "d1"); // unrelated keys stay
});

test("only young signed URLs are kept; unknown or old ones are replaced", async () => {
  const h = harness();
  const view = h.service("../utils/view-cache");
  const realNow = Date.now;
  try {
    let now = 1_000_000;
    Date.now = () => now;
    const first = view.keepImages([], [{ id: "a", thumbnailUrl: "u1", result: "r1" }]);
    now += 60 * 1000; // a minute later the poll re-signs
    const second = view.keepImages(first, [{ id: "a", thumbnailUrl: "u2", result: "r2" }]);
    assert.equal(second[0].thumbnailUrl, "u1"); // young: kept, no reload
    now += 9 * 60 * 1000; // u1 is now 10 minutes old
    const third = view.keepImages(second, [{ id: "a", thumbnailUrl: "u3", result: "r3" }]);
    assert.equal(third[0].thumbnailUrl, "u3"); // old: replaced before it expires
    assert.equal(third[0].result, "r3");
    // A URL restored from storage was never seen arriving: treated as old.
    const restored = view.keepImages([{ id: "b", thumbnailUrl: "cached" }], [{ id: "b", thumbnailUrl: "new" }]);
    assert.equal(restored[0].thumbnailUrl, "new");
  } finally {
    Date.now = realNow;
  }
});

test("the cached task queue paints without the empty state", async () => {
  const h = harness();
  await h.api.signIn();
  h.storage.set("view-cache:tasks", { owner: h.api.sessionUserId(), at: Date.now(), value: { jobs: [{ id: "j1" }], ongoing: [], completed: [{ id: "j1" }], runningCount: 0, failedCount: 0, total: 1 } });
  h.api.request = () => new Promise(() => {}); // the refresh is still on its way
  const page = h.page("tasks");
  page.onShow();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.jobs.length, 1); // wxml shows the empty state on !jobs.length
  page.onUnload();
});

test("a stored config older than the create page's limit is not used to paint", async () => {
  const h = harness();
  await h.api.signIn();
  const owner = h.api.sessionUserId();
  h.storage.set("config-cache", { owner, at: Date.now() - 30 * 60 * 1000, value: { models: [], categories: ["推荐"] } });
  const cache = h.service("../utils/config-cache");
  assert.equal(cache.peekConfig(10 * 60 * 1000), undefined);
  assert.ok(cache.peekConfig()); // category labels may still use it
});

test("a template shown from the list stays when its refresh fails", async () => {
  const h = harness();
  const view = h.service("../utils/view-cache");
  view.rememberRows([{ id: "t1", data: { kind: "video", title: "海边", cover: "c", mode: "" } }]);
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  h.api.request = async () => {
    throw new Error("网络开小差了");
  };
  const page = h.page("template-detail");
  page.onLoad({ id: "t1" });
  await page.load();
  assert.equal(page.data.template.data.title, "海边");
  assert.equal(page.data.loadError, "");
  assert.deepEqual(toasts, ["网络开小差了"]);
});

test("the URL issue-time table stays bounded during long polling", () => {
  const h = harness();
  const view = h.service("../utils/view-cache");
  const realNow = Date.now;
  try {
    let now = 5_000_000;
    Date.now = () => now;
    view.noteIssued("keep-me");
    for (let i = 0; i < 5000; i++) {
      if (i % 40 === 0) now += 3000; // a poll every 3 s, 40 URLs each
      view.noteIssued("u" + i);
    }
    // Old entries are dropped: "keep-me" is now far past the keep window.
    assert.equal(view.freshUrl("keep-me"), false);
    view.noteIssued("probe");
    assert.equal(view.freshUrl("probe"), true);
  } finally {
    Date.now = realNow;
  }
});

test("saving re-fetches a result URL that may be close to expiring", async () => {
  const h = harness();
  const page = h.page("task-detail");
  page.onLoad({ id: "j1" });
  page.setData({ job: { id: "j1", status: "succeeded", result: "https://x/old", input: { kind: "image", assets: [] } } });
  const fetched = [];
  h.api.request = async (path) => (fetched.push(path), { id: "j1", status: "succeeded", result: "https://x/new", createdAt: new Date().toISOString(), input: { kind: "image", prompt: "p", assets: [] } });
  let url;
  h.wx.downloadFile = (o) => ((url = o.url), o.success({ statusCode: 200, tempFilePath: "t" }));
  h.wx.saveImageToPhotosAlbum = async () => ({});
  h.wx.showToast = () => {};
  await page.save();
  assert.deepEqual(fetched, ["/jobs/j1"]);
  assert.equal(url, "https://x/new");
  page.onUnload();
});

test("pending replies never enter the cached conversation", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  h.wx.request = (o) => o.success({ statusCode: 200, data: { items: [
    { id: "a", status: "succeeded", result: "完成的回复", input: { kind: "chat", prompt: "问1" } },
    { id: "b", status: "running", input: { kind: "chat", prompt: "问2" } },
  ], total: 2, page: 1, size: 20 } });
  await page.load(true);
  const cached = h.storage.get("view-cache:agent").value;
  assert.ok(cached.length > 0);
  assert.equal(cached.some((m) => m.pending), false);
  page.onUnload();
});
