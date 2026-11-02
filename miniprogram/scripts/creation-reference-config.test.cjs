const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const asset = (id, type = "image", mb = 1) => ({
  id,
  data: {
    type: type + "/test",
    size: mb * 1024 * 1024,
    url: "/media/test",
    name: id,
  },
});
const base = {
  id: "configured",
  name: "配置模型",
  kind: "image",
  resolutions: ["2k"],
  ratios: ["1:1"],
  modes: ["t2i", "i2i"],
  referenceTypes: ["image"],
  settings: { maxRefImages: 8, maxRefImageSizeMB: 2 },
};
async function editor(model = base) {
  const h = harness(),
    page = h.page("create");
  page.setData({ kind: model.kind });
  h.api.request = async () => ({ models: [model] });
  await page.loadModels();
  return { h, page };
}
const event = (kind) => ({ currentTarget: { dataset: { kind } } });

test("sixth reference is allowed when backend permits eight images", async () => {
  const { h, page } = await editor();
  let uploads = 0;
  h.api.chooseReferenceFile = async () => ({ path: "new.jpg", size: 1024 });
  h.api.upload = async () => {
    uploads++;
    return asset("new");
  };
  page.setData({
    assets: Array.from({ length: 5 }, (_, i) => asset(String(i))),
  });
  await page.addAsset(event("image"));
  assert.equal(uploads, 1);
  assert.equal(page.data.assets.length, 6);
  assert.equal(page.data.maxReferences, 8);
});
test("oversize references are rejected before upload according to model configuration", async () => {
  const { h, page } = await editor();
  let uploads = 0;
  h.api.chooseReferenceFile = async () => ({
    path: "large.jpg",
    size: 3 * 1024 * 1024,
  });
  h.api.upload = async () => {
    uploads++;
    return asset("new");
  };
  await page.addAsset(event("image"));
  assert.equal(uploads, 0);
  assert.equal(page.data.assets.length, 0);
});
test("text-only models hide and reject reference uploads", async () => {
  const { h, page } = await editor({
    ...base,
    referenceTypes: [],
    modes: ["t2i"],
  });
  let pickers = 0;
  h.api.chooseReferenceFile = async () => {
    pickers++;
  };
  page.showAssets();
  await page.addAsset(event("image"));
  assert.equal(page.data.allowImage, false);
  assert.equal(page.data.assetsOpen, false);
  assert.equal(pickers, 0);
});
test("updated backend limits preserve materials but prevent invalid submissions", async () => {
  const { h, page } = await editor();
  let submitted = 0;
  h.api.submitInput = async () => {
    submitted++;
    return { id: "job" };
  };
  page.setData({
    assets: [asset("a"), asset("b")],
    prompt: "我的画面",
    hasPrompt: true,
  });
  h.api.request = async () => ({
    models: [{ ...base, settings: { maxRefImages: 1 } }],
  });
  await page.loadModels();
  await page.generate();
  assert.equal(page.data.assets.length, 2);
  assert.equal(submitted, 0);
});
test("keyframe-only video uses its configured image count and sends the matching mode", async () => {
  const { h, page } = await editor({
    ...base,
    kind: "video",
    modes: ["keyframe"],
    durations: [5],
    settings: {
      refLimits: { "keyframe.imageCount": 2, "keyframe.imageSizeMB": 3 },
    },
  });
  let input;
  h.api.submitInput = async (value) => {
    input = value;
    return { id: "job" };
  };
  page.setData({
    assets: [asset("a"), asset("b")],
    prompt: "转场",
    hasPrompt: true,
  });
  await page.generate();
  assert.equal(input.mode, "keyframe");
  assert.equal(input.assets.length, 2);
});
test("upstream-constrained limits supplied by the backend take precedence", async () => {
  const { h, page } = await editor({
    ...base,
    referenceRules: { i2i: { image: { maxCount: 2, maxSizeMB: 1 } } },
  });
  let pickers = 0;
  page.setData({ assets: [asset("a"), asset("b")] });
  h.api.chooseReferenceFile = async () => {
    pickers++;
  };
  await page.addAsset(event("image"));
  assert.equal(page.data.maxReferences, 2);
  assert.equal(pickers, 0);
});
