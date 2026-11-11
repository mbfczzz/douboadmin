const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const event = (data) => ({ currentTarget: { dataset: data } });
const models = [
  {
    id: "demo-video",
    name: "基础视频模型",
    kind: "video",
    resolutions: ["768p", "1080p"],
    ratios: ["9:16", "16:9"],
    demo: true,
  },
  {
    id: "demo-image",
    name: "基础图片模型",
    kind: "image",
    resolutions: ["1K", "2K"],
    ratios: ["1:1", "4:3"],
    demo: true,
  },
];
test("creation uses available models and valid parameters when switching modes", async () => {
  const h = harness(),
    page = h.page("create");
  h.api.request = async () => ({ models });
  await page.loadModels();
  assert.equal(page.data.modelName, "基础视频模型");
  assert.deepEqual(
    Array.from(page.data.availableModels, (m) => m.id),
    ["demo-video"],
  );
  page.input({ detail: { value: "窗边的光" } });
  page.mode(event({ kind: "image" }));
  await page.loadModels();
  assert.equal(page.data.model, "demo-image");
  assert.equal(page.data.resolution, "1K");
  assert.equal(page.data.ratio, "1:1");
  assert.equal(page.data.prompt, "窗边的光");
  assert.ok(page.data.imagePlaceholder.includes("\n"));
  assert.ok(!page.data.imagePlaceholder.includes("&#10;"));
});
test("model dropdown repairs unsupported parameters and keeps the chosen model", async () => {
  const h = harness(),
    page = h.page("create");
  const other = {
    ...models[0],
    id: "alternate",
    name: "另一个模型",
    resolutions: ["1080p"],
    ratios: ["16:9"],
  };
  h.api.request = async () => ({ models: [...models, other] });
  await page.loadModels();
  page.showModels();
  assert.equal(page.data.showModels, true);
  page.selectModel(event({ id: "alternate" }));
  assert.equal(page.data.showModels, false);
  assert.equal(page.data.resolution, "1080p");
  assert.equal(page.data.ratio, "16:9");
  await page.loadModels();
  assert.equal(page.data.model, "alternate");
});

test("same-name model variants retain public identifiers and configured descriptions", async () => {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [
    { ...models[0], id: "variant-a", key: "seedance-2.5-fast", name: "Seedance 2.5" },
    { ...models[0], id: "variant-b", key: "seedance-2.5-standard", name: "Seedance 2.5" },
    { ...models[0], id: "configured", key: "public-key", settings: { description: "运营配置说明" } },
  ] });
  await page.loadModels();
  assert.deepEqual(Array.from(page.data.availableModels, (m) => m.description), [
    "seedance-2.5-fast", "seedance-2.5-standard", "运营配置说明",
  ]);
  page.selectModel(event({ id: "variant-b" }));
  assert.equal(page.data.model, "variant-b");
  assert.equal(page.data.modelName, "Seedance 2.5");
});
test("reference sheet selects the requested type and cancel preserves existing assets", async () => {
  const h = harness(),
    page = h.page("create");
  h.api.request = async () => ({
    models: [
      {
        ...models[0],
        referenceTypes: ["image", "video"],
        modes: ["t2v", "omni_ref"],
      },
    ],
  });
  await page.loadModels();
  let chosen;
  h.wx.chooseMedia = async (options) => {
    chosen = options;
    throw { errMsg: "chooseMedia:fail cancel" };
  };
  page.setData({ assets: [{ id: "keep", data: { type: "image/jpeg" } }] });
  page.showAssets();
  assert.equal(page.data.assetsOpen, true);
  await page.addAsset(event({ kind: "video" }));
  assert.equal(chosen.mediaType[0], "video");
  assert.equal(page.data.assetsOpen, false);
  assert.equal(page.data.uploading, false);
  assert.equal(page.data.assets[0].id, "keep");
});
test("reference audio selection uses supported file formats and checks size", async () => {
  const h = harness();
  h.wx.chooseMessageFile = async (options) => {
    assert.deepEqual(Array.from(options.extension), ["mp3", "wav"]);
    return {
      tempFiles: [
        { path: "track.mp3", name: "track.mp3", size: 51 * 1024 * 1024 },
      ],
    };
  };
  await assert.rejects(h.api.chooseReferenceFile("audio"), /50 MB/);
});
test("template more action appends remaining templates to the two columns", async () => {
  const h = harness(),
    page = h.page("templates");
  const rows = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      data: { cover: "/media/test.jpg" },
    }));
  h.api.request = async (path) => {
    const page = Number(new URL(path,"https://fixture").searchParams.get("page"));
    return {items:rows.slice((page-1)*4,page*4),total:6};
  };
  await page.load();
  assert.equal(page.data.columns.flatMap((c) => c.items).length, 4);
  page.more();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.data.columns.flatMap((c) => c.items).length, 6);
});
