const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const config = {
  enabled: true,
  voiceModels: [
    { id: "voice-model", name: "配音", voices: ["Zephyr", "Puck"] },
  ],
  ttsModel: "voice-model",
};

test("re-editing restores selected music and voice names", async () => {
  const h = harness(),
    page = h.page("mix");
  h.api.request = async (path) =>
    path === "/mix/config"
      ? config
      : path === "/music"
        ? [{ id: "music-one", data: { title: "背景音乐" } }]
        : { id: "asset", data: { name: "我的音乐.mp3" } };
  h.storage.set("mix-draft", {
    prompt: "脚本",
    assets: [],
    duration: 15,
    ratio: "9:16",
    resolution: "720p",
    mix: { musicId: "music-one", voice: "Puck", ttsModel: "voice-model" },
  });
  page.onShow();
  await new Promise(setImmediate);
  assert.equal(page.data.voiceIndex, 1);
  assert.equal(page.data.musicIndex, 1);
  assert.equal(page.data.musicLabel, "背景音乐");
  page.setData({ musicId: "asset:asset" });
  await page.load();
  await new Promise(setImmediate);
  assert.equal(page.data.musicLabel, "我的音乐.mp3");
});

test("a late music lookup does not overwrite a user's newer selection", async () => {
  const h = harness(),
    page = h.page("mix");
  let finish;
  h.api.request = async (path) =>
    path === "/mix/config"
      ? config
      : path === "/music"
        ? []
        : new Promise((resolve) => (finish = resolve));
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
