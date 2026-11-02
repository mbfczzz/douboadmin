const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const models = [
  {
    id: "demo-video",
    name: "基础视频模型",
    kind: "video",
    durations: [5, 8, 10],
    resolutions: ["768p"],
    ratios: ["9:16"],
  },
  {
    id: "other-video",
    name: "其他模型",
    kind: "video",
    durations: [5, 8, 10],
    resolutions: ["1080p"],
    ratios: ["16:9"],
  },
];
const asset = (id) => ({
  id,
  data: { url: "/media/" + id + ".jpg", name: id + ".jpg", type: "image/jpeg" },
});

test("a second generate tap during the resulting page transition does not create another job", async () => {
  const h = harness(),
    page = h.page("create");
  let submissions = 0;
  h.api.request = async () => ({ models });
  await page.loadModels();
  page.setData({ prompt: "一个镜头", modelsLoading: false });
  h.api.submitInput = async () => ({ id: "job-" + ++submissions });
  await page.generate();
  await page.generate();
  assert.equal(submissions, 1);
  page.onShow();
  await new Promise(setImmediate);
  await page.generate();
  assert.equal(submissions, 2);
});

test("re-editing restores the original model and parameters", async () => {
  const h = harness(),
    page = h.page("create");
  h.api.request = async () => ({ models });
  h.storage.set("edit-draft", {
    kind: "video",
    model: "other-video",
    prompt: "原来的输入",
    ratio: "16:9",
    resolution: "1080p",
    duration: 8,
    assets: [],
  });
  page.onShow();
  await new Promise(setImmediate);
  assert.equal(page.data.model, "other-video");
  assert.equal(page.data.resolution, "1080p");
  assert.equal(page.data.duration, 8);
  assert.equal(page.data.hasPrompt, true);
});

test("an empty model catalog clears old options and prevents submission", async () => {
  const h = harness(),
    page = h.page("create");
  let submitted = 0;
  h.api.request = async () => ({ models: [] });
  h.api.submitInput = async () => {
    submitted++;
  };
  await page.loadModels();
  page.input({ detail: { value: "一幅画" } });
  await page.generate();
  assert.equal(page.data.availableModels.length, 0);
  assert.equal(page.data.model, "");
  assert.ok(page.data.modelError);
  assert.equal(submitted, 0);
});

test("asset restoration failure is recoverable and does not silently submit without references", async () => {
  const h = harness(),
    page = h.page("create");
  let submitted = 0;
  h.api.request = async () => {
    throw new Error("offline");
  };
  h.api.submitInput = async () => {
    submitted++;
  };
  page.setData({
    prompt: "保留我的素材",
    hasPrompt: true,
    modelsLoading: false,
  });
  await page.restoreAssets(["original"]);
  assert.ok(page.data.restoreError);
  await page.generate();
  assert.equal(submitted, 0);
  h.api.request = async () => asset("original");
  await page.restoreAssets(page.restoreIds);
  assert.equal(page.data.restoreError, "");
  assert.equal(page.data.assets[0].id, "original");
});

test("clearing references prevents a late restoration response from adding them back", async () => {
  const h = harness(),
    page = h.page("create");
  let done;
  h.api.request = () =>
    new Promise((resolve) => {
      done = resolve;
    });
  const pending = page.restoreAssets(["old"]);
  page.clearReferences();
  done(asset("old"));
  await pending;
  assert.equal(page.data.assets.length, 0);
  assert.equal(page.data.restoring, false);
});

test("an in-flight upload from an older draft cannot alter the new draft", async () => {
  const h = harness(),
    page = h.page("create");
  h.api.request = async () => ({
    models: [
      { ...models[0], referenceTypes: ["image"], modes: ["t2v", "i2v"] },
    ],
  });
  await page.loadModels();
  let done;
  h.api.chooseReferenceFile = async () => ({ path: "old.jpg" });
  h.api.upload = () =>
    new Promise((resolve) => {
      done = resolve;
    });
  const pending = page.addAsset({
    currentTarget: { dataset: { kind: "image" } },
  });
  await new Promise(setImmediate);
  page.clearReferences();
  page.setData({ assets: [asset("new")] });
  done(asset("old"));
  await pending;
  assert.equal(page.data.assets.length, 1);
  assert.equal(page.data.assets[0].id, "new");
});

test("changing pages during submission does not pull the user to a task detail", async () => {
  const h = harness(),
    page = h.page("create");
  let done;
  h.api.request = async () => ({ models });
  await page.loadModels();
  page.setData({ prompt: "一个镜头", modelsLoading: false });
  h.api.submitInput = () =>
    new Promise((resolve) => {
      done = resolve;
    });
  const pending = page.generate();
  page.onHide();
  done({ id: "job-1" });
  await pending;
  assert.equal(h.nav.length, 0);
  assert.equal(page.data.busy, false);
});

test("image creation rejects non-image references with the current input intact", async () => {
  const h = harness(),
    page = h.page("create");
  let submitted = 0;
  page.setData({
    kind: "image",
    prompt: "保留描述",
    modelsLoading: false,
    assets: [{ id: "video", data: { type: "video/mp4" } }],
  });
  h.api.submitInput = async () => {
    submitted++;
  };
  await page.generate();
  assert.equal(submitted, 0);
  assert.equal(page.data.prompt, "保留描述");
});

test("mix never submits jobs while its service is unavailable", async () => {
  const h = harness(),
    page = h.page("mix");
  let calls = 0;
  h.api.submitInput = async () => {
    calls++;
  };
  page.setData({ config: { enabled: false }, assets: [asset("image")] });
  await page.generate();
  assert.equal(calls, 0);
});

test("the photo file picker restricts supported extensions and rejects other files", async () => {
  const h = harness();
  h.wx.chooseMessageFile = async (options) => {
    assert.deepEqual(Array.from(options.extension), [
      "jpg",
      "jpeg",
      "png",
      "webp",
    ]);
    return {
      tempFiles: [{ path: "document.pdf", name: "document.pdf", size: 32 }],
    };
  };
  await assert.rejects(h.api.chooseMediaFile(true, 2), /请选择.*图片/);
});
