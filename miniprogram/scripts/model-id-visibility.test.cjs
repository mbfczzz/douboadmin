const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("model choices keep routing IDs without displaying them as descriptions", async () => {
  const h = harness(), page = h.page("create");
  const base = {
    kind: "image", name: "同名模型", resolutions: ["1k"], ratios: ["1:1"],
    qualities: [], durations: [], referenceTypes: [],
  };
  h.api.request = async () => ({ models: [
    { ...base, id: "first", key: "private-upstream-a" },
    { ...base, id: "second", key: "private-upstream-b", settings: { description: "适合产品摄影" } },
  ] });
  page.setData({ kind: "image" });
  await page.loadModels();
  assert.equal(page.data.model, "first");
  assert.equal(page.data.modelName, "同名模型");
  assert.equal(page.data.availableModels[0].description, "");
  assert.equal(page.data.availableModels[1].description, "适合产品摄影");
  assert.equal(page.data.availableModels[1].id, "second");
});

test("historical jobs never use the routing ID as a visible model name", () => {
  const h = harness();
  const job = { status: "succeeded", createdAt: "2026-11-12T00:00:00Z",
    input: { kind: "image", model: "private-model-id", prompt: "测试", assets: [] } };
  assert.equal(h.api.jobView(job).modelName, "模型信息暂缺");
  assert.equal(h.api.jobView(job).input.model, "private-model-id");
  assert.equal(h.api.jobView({ ...job, modelName: "图片模型" }).modelName, "图片模型");
});
