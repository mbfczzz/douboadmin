const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const config = { mixAvailable: false, mixMessage: "混剪功能暂未开放" };

test("mix UI reads real general capabilities and never calls retired APIs", async () => {
  const h = harness(),
    page = h.page("mix"),
    paths = [];
  h.api.request = async (path) => {
    paths.push(path);
    return path === "/config"
      ? config
      : { id: "asset", data: { name: "我的音乐.mp3" } };
  };
  h.storage.set("mix-draft", {
    prompt: "保留脚本",
    assets: [],
    duration: 15,
    ratio: "9:16",
    resolution: "720p",
    mix: {
      musicId: "retired-library",
      voice: "Puck",
      ttsModel: "retired-model",
    },
  });
  page.onShow();
  await new Promise(setImmediate);
  assert.equal(page.data.config.enabled, false);
  assert.equal(page.data.config.message, "混剪功能暂未开放");
  assert.equal(page.data.script, "保留脚本");
  assert.equal(page.data.musicLabel, "请重新上传音乐文件");
  assert.equal(page.data.narration, false);
  assert.deepEqual(paths, ["/config"]);
  page.setData({ musicId: "asset:asset" });
  await page.load();
  await new Promise(setImmediate);
  assert.equal(page.data.musicLabel, "我的音乐.mp3");
});

test("a late music lookup cannot overwrite a newer user selection", async () => {
  const h = harness(),
    page = h.page("mix");
  let finish;
  h.api.request = async (path) =>
    path === "/config" ? config : new Promise((resolve) => (finish = resolve));
  page.setData({ musicId: "asset:old" });
  await page.load();
  page.chooseMusic({ detail: { value: "0" } });
  finish({ data: { name: "旧音乐.mp3" } });
  await new Promise(setImmediate);
  assert.equal(page.data.musicId, "");
  assert.equal(page.data.musicLabel, "不使用背景音乐");
});

test("leaving while a music picker is open prevents a late upload", async () => {
  const h = harness(),
    page = h.page("mix");
  let finish,
    uploads = 0;
  h.api.chooseReferenceFile = () =>
    new Promise((resolve) => (finish = resolve));
  h.api.upload = async () => {
    uploads++;
    return { id: "new", data: { name: "音乐" } };
  };
  const task = page.uploadMusic();
  page.onUnload();
  finish({ path: "/tmp/music.mp3" });
  await task;
  assert.equal(uploads, 0);
  assert.equal(page.data.musicId, "");
});

test("mix cannot create or quote a job even with stale enabled state", async () => {
  const h = harness(),
    page = h.page("mix");
  let calls = 0;
  h.api.submitInput = h.api.request = async () => {
    calls++;
  };
  page.setData({
    config: { enabled: true },
    assets: [{ id: "image", data: { type: "image/jpeg" } }],
  });
  await page.generate();
  assert.equal(calls, 0);
});

test("a capability response arriving after leaving cannot update the page", async () => {
  const h = harness(),
    page = h.page("mix");
  let finish;
  h.api.request = () => new Promise((resolve) => (finish = resolve));
  const task = page.load();
  page.onUnload();
  finish(config);
  await task;
  assert.equal(page.data.config, null);
});
