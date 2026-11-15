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

test("creation model choices preserve the backend order within each type", async () => {
  const h = harness(), page = h.page("create");
  const models = [
    { ...model, id: "second-page-first", name: "排在前面" },
    { ...model, id: "video", kind: "video" },
    { ...model, id: "formerly-first", name: "排在后面" },
  ];
  h.api.request = async () => ({ models });
  page.setData({ kind: "image" });
  await page.loadModels();
  assert.equal(page.data.model, "second-page-first");
  assert.deepEqual(Array.from(page.data.availableModels, (item) => item.id), ["second-page-first", "formerly-first"]);
});

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

test("hidden selectors use valid defaults for both pricing and submission and can be restored", async () => {
  const h = harness(), page = h.page("create");
  let hidden = true, submitted;
  h.api.request = async () => ({ models: [{ ...model,
    resolutions: ["1k", "2k"], qualities: ["low", "high"],
    settings: { ...model.settings, hideQuality: hidden, hideResolution: hidden },
  }] });
  h.api.submitInput = async (input) => { submitted = input; return { id: "hidden-test" }; };
  page.setData({ kind: "image", quality: "high", resolution: "2k" });
  await page.loadModels();
  assert.equal(page.data.qualities.length, 0);
  assert.equal(page.data.resolutions.length, 0);
  assert.equal(page.data.quality, "low");
  assert.equal(page.data.resolution, "1k");
  assert.equal(page.data.parameterError, "");
  await page.generate();
  assert.equal(submitted.quality, "low");
  assert.equal(submitted.resolution, "1k");
  hidden = false;
  await page.loadModels();
  assert.deepEqual(Array.from(page.data.qualities), ["low", "high"]);
  assert.deepEqual(Array.from(page.data.resolutions), ["1k", "2k"]);
});

test("hidden resolution follows the current generation mode instead of an unsupported default", async () => {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [{ ...model,
    modes: ["t2i", "i2i"], resolutions: ["1k", "2k"],
    resolutionByMode: { t2i: ["1k"], i2i: ["2k"] },
    settings: { ...model.settings, hideResolution: true },
  }] });
  page.setData({ kind: "image" });
  await page.loadModels();
  assert.equal(page.data.resolution, "1k");
  page.setData({ assets: [{ id: "reference", data: { type: "image/png" } }] });
  page.refreshParameters();
  assert.equal(page.data.resolution, "2k");
  assert.equal(page.data.resolutions.length, 0);
  assert.equal(page.data.parameterError, "");
});

test("expanded video parameters submit the user's selection, never the configured maximum", async () => {
  const h = harness(), page = h.page("create");
  let submitted;
  h.api.request = async () => ({ models: [{ ...model, kind: "video", modes: ["t2v"], qualities: [],
    resolutions: ["720p", "4k"], ratios: ["16:9", "21:9"], durations: Array.from({ length: 30 }, (_, i) => i + 1),
  }] });
  h.api.submitInput = async (input) => { submitted = input; return { id: "expanded" }; };
  await page.loadModels();
  page.duration({ detail: { value: 5 } });
  page.chooseResolution({ currentTarget: { dataset: { value: "4k" } } });
  page.chooseRatio({ currentTarget: { dataset: { value: "21:9" } } });
  await page.generate();
  assert.equal(submitted.duration, 6);
  assert.equal(submitted.resolution, "4k");
  assert.equal(submitted.ratio, "21:9");
});

test("quality labels tolerate legacy casing without rewriting the submitted price key", async () => {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [{ ...model, qualities: ["LOW", "MEDIUM", "HIGH"] }] });
  page.setData({ kind: "image", quality: "MEDIUM" });
  await page.loadModels();
  assert.equal(page.data.qualityNames?.LOW, "低");
  assert.equal(page.data.qualityNames?.MEDIUM, "中");
  assert.equal(page.data.qualityNames?.HIGH, "高");
  assert.equal(page.data.quality, "MEDIUM");
});
