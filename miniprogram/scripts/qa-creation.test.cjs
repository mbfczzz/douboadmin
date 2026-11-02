const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const model = {
  id: "video",
  name: "模型",
  kind: "video",
  modes: ["t2v", "i2v"],
  resolutions: ["1080p", "720p"],
  resolutionByMode: { i2v: ["720p"] },
  ratios: ["9:16"],
  durations: [5],
  referenceTypes: ["image"],
};
const photo = {
  id: "photo",
  data: { type: "image/jpeg", size: 1024, url: "/media/photo" },
};

test("returning from the system picker during model refresh does not discard the selected photo", async () => {
  const h = harness(),
    page = h.page("create");
  let pick,
    refresh,
    uploads = 0;
  h.api.request = async () => ({ models: [model] });
  await page.loadModels();
  h.api.chooseReferenceFile = () => new Promise((resolve) => (pick = resolve));
  h.api.upload = async () => {
    uploads++;
    return photo;
  };
  const adding = page.addAsset({
    currentTarget: { dataset: { kind: "image" } },
  });
  h.api.request = () => new Promise((resolve) => (refresh = resolve));
  const reloading = page.loadModels();
  pick({ path: "photo.jpg", size: 1024 });
  await adding;
  refresh({ models: [model] });
  await reloading;
  assert.equal(uploads, 1);
  assert.equal(page.data.assets.length, 1);
});

test("restoring references from a previous task also refreshes mode-specific parameters", async () => {
  const h = harness(),
    page = h.page("create");
  h.api.request = async () => ({ models: [model] });
  await page.loadModels();
  h.api.request = async () => photo;
  await page.restoreAssets(["photo"]);
  assert.equal(page.data.resolution, "720p");
});
test("configured minimum reference count is enforced before submitting", async () => {
  const h = harness(),
    page = h.page("create");
  let submissions = 0;
  h.api.request = async () => ({
    models: [
      {
        ...model,
        kind: "image",
        modes: ["i2i"],
        referenceRules: {
          i2i: { image: { minCount: 2, maxCount: 4, maxSizeMB: 50 } },
        },
      },
    ],
  });
  page.setData({ kind: "image", assets: [photo], prompt: "创作" });
  await page.loadModels();
  h.api.submitInput = async () => {
    submissions++;
    return { id: "job" };
  };
  await page.generate();
  assert.equal(submissions, 0);
  assert.equal(page.data.assets.length, 1);
});

test("a model disabled while the picker is open prevents uploading", async () => {
  const h = harness(),
    page = h.page("create");
  let finish,
    uploads = 0;
  h.api.request = async () => ({ models: [model] });
  await page.loadModels();
  h.api.chooseReferenceFile = () =>
    new Promise((resolve) => (finish = resolve));
  h.api.upload = async () => {
    uploads++;
    return photo;
  };
  const pending = page.addAsset({
    currentTarget: { dataset: { kind: "image" } },
  });
  h.api.request = async () => ({
    models: [{ ...model, referenceTypes: [], modes: ["t2v"] }],
  });
  await page.loadModels();
  finish({ path: "private.jpg", size: 1024 });
  await pending;
  assert.equal(uploads, 0);
});
test("adding a reference repairs resolutions restricted by generation mode", async () => {
  const h = harness(),
    page = h.page("create");
  h.api.request = async () => ({ models: [model] });
  await page.loadModels();
  assert.equal(page.data.resolution, "1080p");
  h.api.chooseReferenceFile = async () => ({ path: "photo.jpg", size: 1024 });
  h.api.upload = async () => photo;
  await page.addAsset({ currentTarget: { dataset: { kind: "image" } } });
  assert.equal(page.data.resolution, "720p");
  assert.deepEqual(Array.from(page.data.resolutions), ["720p"]);
  page.clearReferences();
  assert.equal(page.data.resolutions.length, 2);
});
test("no compatible resolution disables submission without discarding the draft", async () => {
  const h = harness(),
    page = h.page("create");
  let submissions = 0;
  h.api.request = async () => ({
    models: [
      { ...model, resolutions: ["1080p"], resolutionByMode: { i2v: [] } },
    ],
  });
  page.setData({ assets: [photo], prompt: "保留我的文案" });
  await page.loadModels();
  h.api.submitInput = async () => {
    submissions++;
    return { id: "task" };
  };
  await page.generate();
  assert.equal(submissions, 0);
  assert.ok(page.data.parameterError);
  assert.equal(page.data.prompt, "保留我的文案");
});
