const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// 一键复刻 takes a video from the phone, and suggests hot videos to remake.
test("an uploaded video is remade through /remake/upload with its length", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("remake");
  h.wx.chooseMedia = async () => ({ tempFiles: [{ tempFilePath: "v.mp4", size: 1024, duration: 18.4 }] });
  let during;
  h.api.upload = async (path, avatar, token, onProgress) => {
    onProgress(40); // the button follows the upload
    during = page.data.uploadPercent;
    return { id: "a".repeat(32), data: { url: "/m/v.mp4", thumbnailUrl: "/m/v.jpg", type: "video/mp4" } };
  };
  const posts = [];
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    if (o.method === "POST") posts.push({ path, data: o.data });
    o.success({ statusCode: path === "/remake/upload" ? 202 : 200, data: path === "/remake/upload" ? { id: "job1", status: "queued", input: o.data } : { enabled: false, keywords: [] } });
  };
  const replaced = [];
  h.wx.redirectTo = (o) => replaced.push(o.url);
  await page.uploadVideo();
  assert.equal(during, 40);
  assert.equal(page.data.uploadingVideo, false);
  assert.equal(page.data.video.uploaded, true);
  assert.equal(page.data.seconds, 18);
  assert.equal(page.data.tooLong, false); // no model limit known here: it starts
  await new Promise((resolve) => setTimeout(resolve, 0)); // it starts by itself
  assert.equal(posts.filter((p) => p.path === "/remake/upload").length, 1);
  assert.deepEqual(replaced, ["/pages/task-detail/index?id=job1"]);
  assert.deepEqual(JSON.parse(JSON.stringify(posts.find((p) => p.path === "/remake/upload").data)), { video: "a".repeat(32), assets: [], title: "我上传的视频", duration: 18 });
  page.change();
  assert.equal(page.uploadId, "");
});

// A video longer than any model takes as a reference is refused before upload.
test("a phone video longer than the longest reference is refused before uploading", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("remake");
  h.wx.chooseMedia = async () => ({ tempFiles: [{ tempFilePath: "v.mp4", size: 1024, duration: 41 }] });
  let uploads = 0;
  h.api.upload = async () => { uploads++; return { id: "x", data: {} }; };
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  h.wx.showModal = (o) => toasts.push(o.content);
  h.wx.request = (o) => o.success({ statusCode: 200, data: { models: [{ id: "sd25", kind: "video", name: "Sd 2.5", referenceRules: { omni_ref: { video: { maxCount: 10, maxSizeMB: 50, maxSeconds: 30 } } } }] } });
  await page.uploadVideo();
  assert.equal(uploads, 0);
  assert.match(toasts.join(), /41 秒，参考视频最长只能 30 秒，生成不了/);
});

test("hot videos are offered while nothing is chosen; a tap loads one", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("remake");
  const items = Array.from({ length: 8 }, (_, i) => ({ id: "70" + i, title: "视频" + i, cover: "/c.jpg", likes: 1000, views: 0, publishedAt: "2026-11-01T00:00:00Z", duration: 12, author: "a", text: "" }));
  const calls = [];
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    calls.push(path);
    if (path.startsWith("/hot/discovery")) return o.success({ statusCode: 200, data: { enabled: true, keywords: ["热门", "探店"] } });
    if (path.startsWith("/hot/videos?")) return o.success({ statusCode: 200, data: { items, cursor: 0, searchId: "", backtrace: "" } });
    if (path === "/hot/videos/703") return o.success({ statusCode: 200, data: items[3] });
    o.success({ statusCode: 200, data: {} });
  };
  await page.loadPicks();
  assert.deepEqual(Array.from(page.data.pickWords), ["热门", "探店"]);
  assert.equal(page.data.picks.length, 6);
  assert.match(calls.find((c) => c.startsWith("/hot/videos?")), /q=%E7%83%AD%E9%97%A8.*history=0/);
  h.wx.pageScrollTo = () => {};
  page.usePick({ currentTarget: { dataset: { id: "703" } } });
  for (let i = 0; i < 20 && !page.data.video; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(page.data.video.id, "703");
});

test("a video upload reports its progress and may take twenty minutes; other uploads keep 90 s", async () => {
  const h = harness();
  await h.api.signIn();
  const sent = [], seen = [];
  h.wx.uploadFile = (o) => {
    sent.push(o);
    queueMicrotask(() => o.success({ statusCode: 201, data: JSON.stringify({ id: "a1", data: { url: "/m/a.mp4", type: "video/mp4" } }) }));
    return { onProgressUpdate: (cb) => cb({ progress: 55 }) };
  };
  await h.api.upload("v.mp4", false, undefined, (p) => seen.push(p));
  await h.api.upload("p.jpg");
  assert.deepEqual(seen, [55]);
  assert.equal(sent[0].timeout, 1200000);
  assert.equal(sent[1].timeout, 90000);
});

test("a hot video longer than the longest reference says it cannot be remade and does not start", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("remake");
  const posts = [];
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1].split("?")[0];
    if (o.method === "POST") posts.push(path);
    const models = [{ id: "sd25", kind: "video", name: "Sd 2.5", referenceRules: { omni_ref: { video: { maxCount: 10, maxSizeMB: 50, maxSeconds: 30 } } } }];
    const data = path === "/config" ? { models } : path.startsWith("/hot/videos/") ? { id: "7301", title: "长视频", cover: "/c.jpg", duration: 48, likes: 0, views: 0, publishedAt: "2026-11-01T00:00:00Z", author: "a", text: "" } : { enabled: false, keywords: [] };
    o.success({ statusCode: 200, data });
  };
  page.onLoad({ id: "7301" });
  await page.load();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.data.tooLong, true);
  assert.equal(page.data.limit, 30);
  assert.equal(posts.filter((p) => p.startsWith("/remake") || p.startsWith("/hot/videos/7301/import")).length, 0, "nothing started");
  assert.match(require("node:fs").readFileSync("pages/remake/index.wxml", "utf8"), /参考视频最长只能 \{\{limit\}\} 秒，这条视频生成不了/);
});

test("a 图文 post says it has no video to remake and does not start", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("remake");
  const posts = [];
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1].split("?")[0];
    if (o.method === "POST") posts.push(path);
    const data = path.startsWith("/hot/videos/") ? { id: "7712", title: "国风写真", cover: "/c.jpg", duration: 10, likes: 0, views: 0, publishedAt: "2026-11-01T00:00:00Z", author: "a", text: "", imagePost: true } : { models: [], enabled: false, keywords: [] };
    o.success({ statusCode: 200, data });
  };
  page.onLoad({ id: "7712" });
  await page.load();
  await page.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.data.imagePost, true);
  assert.equal(posts.length, 0, "nothing started");
  const wxml = require("node:fs").readFileSync("pages/remake/index.wxml", "utf8");
  assert.match(wxml, /这是图文作品，没有视频可以复刻/);
  assert.match(wxml, /wx:if="\{\{video&&!busy&&!imagePost\}\}" class="biz-action remake-start"/);
  page.change();
  assert.equal(page.data.imagePost, false);
});
