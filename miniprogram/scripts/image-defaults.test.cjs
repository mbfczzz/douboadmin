const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const image = (extra = {}) => ({ id: "image-a", name: "图片", kind: "image", modes: ["t2i"],
  resolutions: ["1k", "2k", "4k"], qualities: ["low", "medium", "high"], ratios: ["1:1"], ...extra });
const event = (value) => ({ currentTarget: { dataset: { value } } });

for (const [resolutions, qualities, resolution, quality] of [
  [["2k", "4K", "1k"], ["medium", "HIGH", "low"], "4K", "HIGH"],
  [["1k", "2k"], ["low", "medium"], "2k", "medium"],
  [["1k"], ["low"], "1k", "low"],
  [["4k"], [], "4k", ""],
  [[], ["high"], "", "high"],
]) {
  test(`image defaults to highest available ${resolution}/${quality}`, async () => {
    const h = harness(), page = h.page("create");
    h.api.request = async () => ({ models: [image({ resolutions, qualities })] });
    page.setData({ kind: "image" });
    await page.loadModels();
    assert.equal(page.data.resolution, resolution);
    assert.equal(page.data.quality, quality);
    let submitted;
    h.api.submitInput = async (input) => { submitted = input; return { id: "test" }; };
    page.input({ detail: { value: "测试" } });
    await page.generate();
    assert.equal(submitted.resolution, resolution);
    assert.equal(submitted.quality, quality);
  });
}

test("manual image choices survive refresh but switching models starts at that model's maximum", async () => {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [image(), image({ id: "image-b", resolutions: ["1k", "2k"], qualities: ["low", "medium"] })] });
  page.setData({ kind: "image" });
  await page.loadModels();
  page.chooseResolution(event("1k"));
  page.chooseQuality(event("low"));
  await page.loadModels();
  assert.equal(page.data.resolution, "1k");
  assert.equal(page.data.quality, "low");
  page.selectModel({ currentTarget: { dataset: { id: "image-b" } } });
  assert.equal(page.data.resolution, "2k");
  assert.equal(page.data.quality, "medium");
});

test("fresh configuration replaces an automatic cached default with the new maximum", async () => {
  const h = harness();
  h.api.request = async () => ({ models: [image({ resolutions: ["1k", "2k"], qualities: ["low"] })] });
  await h.service("../utils/config-cache").loadConfig();
  h.api.request = async () => ({ models: [image()] });
  const page = h.page("create");
  page.setData({ kind: "image" });
  await page.loadModels();
  assert.equal(page.data.resolution, "4k");
  assert.equal(page.data.quality, "high");
});

test("editing an existing image restores its explicit settings instead of increasing cost", async () => {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [image()] });
  h.storage.set("edit-draft", { kind: "image", model: "image-a", prompt: "原图", resolution: "1k", quality: "low", ratio: "1:1", assets: [] });
  page.onShow();
  await page.loadModels();
  assert.equal(page.data.resolution, "1k");
  assert.equal(page.data.quality, "low");
  page.onUnload();
});

for (const warm of [false, true]) {
  test(`stale ${warm ? "page options" : "configuration cache"} cannot replace restored image choices`, async () => {
    const h = harness(), page = h.page("create");
    const old = image({ resolutions: ["4k"], qualities: ["high"] });
    h.api.request = async () => ({ models: [old] });
    if (warm) {
      page.setData({ kind: "image" });
      await page.loadModels();
    } else await h.service("../utils/config-cache").loadConfig();
    let release;
    h.api.request = () => new Promise((resolve) => { release = resolve; });
    h.storage.set("edit-draft", { kind: "image", model: "image-a", prompt: "原图", resolution: "1k", quality: "low", ratio: "1:1", assets: [] });
    page.onShow();
    const pending = page.loadModels();
    await new Promise(setImmediate);
    release({ models: [image()] });
    await pending;
    assert.equal(page.data.resolution, "1k");
    assert.equal(page.data.quality, "low");
    page.onUnload();
  });
}

test("a casing-only configuration change retains the manually selected tier", async () => {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [image({ resolutions: ["1K", "4K"], qualities: ["LOW", "HIGH"] })] });
  page.setData({ kind: "image" });
  await page.loadModels();
  page.chooseResolution(event("1K"));
  page.chooseQuality(event("LOW"));
  h.api.request = async () => ({ models: [image()] });
  await page.loadModels();
  assert.equal(page.data.resolution, "1k");
  assert.equal(page.data.quality, "low");
});
