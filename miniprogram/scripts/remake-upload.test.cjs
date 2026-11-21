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
  await page.uploadVideo();
  assert.equal(during, 40);
  assert.equal(page.data.uploadingVideo, false);
  assert.equal(page.data.video.uploaded, true);
  assert.equal(page.data.seconds, 18);
  assert.equal(page.data.tooLong, true); // over the ~15 s most models take
  await page.start();
  assert.deepEqual(JSON.parse(JSON.stringify(posts.find((p) => p.path === "/remake/upload").data)), { video: "a".repeat(32), assets: [], title: "我上传的视频", duration: 18 });
  page.change();
  assert.equal(page.uploadId, "");
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

test("a video upload reports its progress and may take five minutes; other uploads keep 90 s", async () => {
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
  assert.equal(sent[0].timeout, 300000);
  assert.equal(sent[1].timeout, 90000);
});
