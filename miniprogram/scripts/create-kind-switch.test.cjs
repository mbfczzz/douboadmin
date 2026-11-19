const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// 生成视频 ⇄ 生成图片 paints the cached models at once: no loading state and
// no model name left over from the other kind while /config refreshes.
test("switching kind shows the cached models immediately", async () => {
  const h = harness({ setTimeout: () => 0, clearTimeout() {} });
  h.storage.set("douboSession", { token: "t", userId: "user", expiresAt: Date.now() + 60000 });
  const base = { resolutions: ["720p"], ratios: ["9:16", "1:1"], qualities: [], referenceTypes: ["image"] };
  const config = { models: [
    { ...base, id: "img", kind: "image", name: "图片模型", modes: ["t2i"] },
    { ...base, id: "vid", kind: "video", name: "视频模型", modes: ["t2v"], durations: [5] },
  ] };
  let release;
  h.api.request = async () => config;
  const page = h.page("create");
  page.setData({ kind: "video" });
  await page.loadModels();
  assert.equal(page.data.modelName, "视频模型");
  h.api.request = () => new Promise((done) => { release = () => done(config); });
  page.mode({ currentTarget: { dataset: { kind: "image" } } });
  assert.equal(page.data.modelsLoading, false, "no loading state while refreshing");
  assert.equal(page.data.modelName, "图片模型");
  release();
  await new Promise(setImmediate);
  assert.equal(page.data.modelName, "图片模型");
});
