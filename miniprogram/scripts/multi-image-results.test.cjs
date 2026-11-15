const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

const urls = [1, 2, 3, 4].map((i) => `https://cdn.test/${i}.png`);
const job = () => ({ id: "multi", status: "succeeded", result: urls[0], results: urls,
  input: { kind: "image", prompt: "four images", assets: [] }, createdAt: new Date().toISOString() });

test("four results preview from the clicked image and save individually or together", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  page.onLoad({ id: "multi" });
  h.api.request = async () => job();
  await page.load();
  let preview;
  h.wx.previewImage = (options) => { preview = options; };
  await page.preview({ detail: { index: 2 } });
  assert.equal(preview.current, urls[2]);
  assert.deepEqual(Array.from(preview.urls), urls);
  const downloaded = [], saved = [];
  h.wx.downloadFile = (options) => { downloaded.push(options.url); options.success({ statusCode: 200, tempFilePath: options.url }); };
  h.wx.saveImageToPhotosAlbum = async (options) => saved.push(options.filePath);
  await page.save({ detail: { index: 3 } });
  assert.deepEqual(saved, [urls[3]]);
  await page.save();
  assert.deepEqual(saved, [urls[3], ...urls]);
  assert.equal(page.data.busy, false);
});

test("an expired gallery refreshes every URL and does not expose deleted results", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  page.onLoad({ id: "multi" });
  page.setData({ job: h.api.jobView(job()) });
  const fresh = urls.map((url) => url + "?signed=new");
  h.api.request = async () => ({ ...job(), result: fresh[0], results: fresh });
  let preview;
  h.wx.previewImage = (options) => { preview = options; };
  await page.preview({ detail: { index: 1 } });
  assert.deepEqual(Array.from(preview.urls), fresh);
  assert.equal(preview.current, fresh[1]);
  page.setData({ job: { ...job(), deleted: true } });
  preview = undefined;
  await page.preview();
  assert.equal(preview, undefined);
});

test("partial album saves report the count and stop at the failed image", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  page.onLoad({ id: "multi" });
  h.api.request = async () => job();
  await page.load();
  const saved = [], toasts = [];
  h.wx.showToast = (options) => toasts.push(options.title);
  h.wx.downloadFile = (options) => options.success({ statusCode: options.url === urls[1] ? 503 : 200, tempFilePath: options.url });
  h.wx.saveImageToPhotosAlbum = async (options) => saved.push(options.filePath);
  await page.save();
  assert.deepEqual(saved, [urls[0]]);
  assert.match(toasts.at(-1), /已保存 1\/4 张/);
  assert.equal(page.data.busy, false);
});

test("single legacy image and shared galleries stay compatible", async () => {
  const h = harness();
  assert.deepEqual(Array.from(h.api.jobView({ ...job(), results: undefined }).results), [urls[0]]);
  const page = h.page("shared-work");
  page.onLoad({ token: "share" });
  h.api.request = async () => ({ kind: "image", title: "四张图", result: urls[0], results: urls });
  await page.load();
  let preview;
  h.wx.previewImage = (options) => { preview = options; };
  await page.preview({ detail: { index: 3 } });
  assert.equal(preview.current, urls[3]);
  assert.equal(preview.urls.length, 4);
});

test("gallery template offers independent save actions and a two-column layout", () => {
  const wxml = fs.readFileSync("components/result-gallery/index.wxml", "utf8");
  const css = fs.readFileSync("components/result-gallery/index.wxss", "utf8");
  assert.match(wxml, /wx:for="{{images}}"/);
  assert.match(wxml, /data-index="{{index}}" bindtap="save"/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("leaving a shared preview before its refresh completes does not open images", async () => {
  const h = harness(), page = h.page("shared-work");
  page.onLoad({ token: "share" });
  page.setData({ work: { kind: "image", title: "old", result: urls[0], results: urls } });
  let resolve, previews = 0;
  h.api.request = () => new Promise((done) => { resolve = done; });
  h.wx.previewImage = () => previews++;
  const pending = page.preview({ detail: { index: 2 } });
  page.onUnload();
  resolve({ kind: "image", title: "new", result: urls[0], results: urls });
  await pending;
  assert.equal(previews, 0);
});

test("logout while downloading stops album writes and the remainder of a batch", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  page.onLoad({ id: "multi" });
  h.api.request = async () => job();
  await page.load();
  let download, saved = 0;
  h.wx.downloadFile = (options) => { download = options; };
  h.wx.saveImageToPhotosAlbum = async () => saved++;
  const pending = page.save();
  await new Promise(setImmediate);
  await h.api.logout();
  download.success({ statusCode: 200, tempFilePath: "private-image" });
  await pending;
  assert.equal(saved, 0);
  assert.equal(page.data.busy, false);
});

test("cached legacy single-image tasks still display before the network refresh", () => {
  const h = harness();
  const cache = h.service("../utils/view-cache");
  const old = { ...job(), results: undefined };
  cache.rememberRows([old]);
  const page = h.page("task-detail");
  page.onLoad({ id: "multi" });
  assert.deepEqual(Array.from(page.data.job.results || []), [urls[0]]);
});

test("gallery cache keeps signature refreshes but never substitutes another image ID", () => {
  const h = harness(), cache = h.service("../utils/view-cache");
  const before = "https://cdn.test/image?id=1&Signature=old&Expires=100";
  const after = "https://cdn.test/image?id=2&Signature=new&Expires=200";
  const shown = cache.keepImages([], [{ id: "multi", result: before, results: [before] }]);
  const changed = cache.keepImages(shown, [{ id: "multi", result: after, results: [after] }])[0];
  assert.equal(changed.result, after);
  assert.equal(changed.results[0], after);
  const resigned = "https://cdn.test/image?id=1&Signature=new&Expires=200";
  const refreshed = cache.keepImages(shown, [{ id: "multi", result: resigned, results: [resigned] }])[0];
  assert.equal(refreshed.result, before);
  assert.equal(refreshed.results[0], before);
});

test("leaving a task during URL refresh prevents a late preview and duplicate taps share the guard", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  page.onLoad({ id: "multi" });
  page.setData({ job: h.api.jobView(job()) });
  let resolve, requests = 0, previews = 0;
  h.api.request = () => { requests++; return new Promise((done) => { resolve = done; }); };
  h.wx.previewImage = () => previews++;
  const pending = page.preview();
  await page.preview();
  assert.equal(requests, 1);
  page.onHide();
  resolve(job());
  await pending;
  assert.equal(previews, 0);
  assert.equal(page.previewing, false);
});

test("logout makes cached private gallery rows inaccessible", async () => {
  const h = harness();
  await h.api.signIn();
  const cache = h.service("../utils/view-cache");
  cache.rememberRows([h.api.jobView(job())]);
  assert.ok(cache.recallRow("multi"));
  await h.api.logout();
  assert.equal(cache.recallRow("multi"), undefined);
});
