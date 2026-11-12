const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const model = {
  id: "operator-configured",
  name: "配置模型",
  kind: "image",
  resolutions: ["2k"],
  ratios: ["1:1"],
  qualities: ["high"],
  durations: [],
  referenceTypes: ["image"],
  settings: {
    defaultPrompt: "默认产品摄影",
    ideas: ["夜色街景"],
    maxPromptChars: 100,
    maxRefImages: 2,
  },
};

test("backend model settings initialize the editor without overwriting an existing draft", async () => {
  const h = harness(),
    page = h.page("create");
  h.api.request = async () => ({ models: [model] });
  page.setData({ kind: "image" });
  await page.loadModels();
  assert.equal(page.data.prompt, "默认产品摄影");
  assert.equal(page.data.maxPromptChars, 100);
  assert.equal(page.data.maxReferences, 2);
  assert.equal(page.data.ideas, undefined);
  page.input({ detail: { value: "我的描述" } });
  await page.loadModels();
  assert.equal(page.data.prompt, "我的描述");
});

test("model-specific prompt limit stops generation before submitting a task", async () => {
  const h = harness(),
    page = h.page("create");
  let submissions = 0;
  h.api.request = async () => ({ models: [model] });
  h.api.submitInput = async () => {
    submissions++;
  };
  page.setData({ kind: "image" });
  await page.loadModels();
  page.input({ detail: { value: "字".repeat(101) } });
  await page.generate();
  assert.equal(submissions, 0);
  assert.equal(page.data.prompt.length, 101);
});
