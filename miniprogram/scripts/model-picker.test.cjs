const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

// Every generation that used to pick its model alone offers model-picker:
// the default first, the user's pick used and remembered per feature.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ids = (list) => Array.from(list, (m) => m.id).join();
const video = (id, refs) => ({ id, kind: "video", name: id, referenceTypes: refs, modes: ["t2v", "omni_ref"], durations: [5, 10], resolutions: ["720p"], ratios: ["9:16"], settings: {} });
const image = (id) => ({ id, kind: "image", name: id, referenceTypes: ["image"], ratios: ["3:4"], resolutions: ["2K"], qualities: [], durations: [], modes: ["i2i"], settings: {} });
const chat = (id, refs, key = "") => ({ id, kind: "chat", name: id, key, referenceTypes: refs, settings: {} });

test("each generation page shows the picker", () => {
  const read = (f) => fs.readFileSync(f, "utf8");
  for (const [page, handler] of [["task-detail", "chooseRemakeModel"], ["tryon", "aiModel"], ["extract", "chooseReadModel"], ["agent", "choosePlanModel"], ["create", "chooseScriptModel"]]) {
    assert.match(read(`pages/${page}/index.json`), /"model-picker": "\/components\/model-picker\/index"/, page);
    const wxml = page === "agent" ? read("pages/agent/index.wxml") : page === "create" ? read("pages/create/parts/feature.wxml") : read(`pages/${page}/index.wxml`);
    assert.ok(wxml.includes(`bind:change="${handler}"`), page);
  }
});

test("生成同款 offers the models that take the original video and uses the pick", async () => {
  const h = harness(), submitted = [], toasts = [];
  h.service("hot-import").remakeBrief = async () => ({ prompt: "复刻描述", width: 0, height: 0 });
  h.service("../utils/config-cache").loadConfig = async () => ({ models: [video("text-only", []), video("video-only", ["video"]), video("both", ["image", "video"])] });
  h.api.submitInput = async (input) => { submitted.push(input); return { id: "gen", input, status: "queued" }; };
  h.wx.showToast = (o) => toasts.push(o.title);
  h.service("reference-clip").referenceClip = async (id) => id + "-clip";
  const page = h.page("task-detail");
  page.setData({ swapLoaded: true, job: { id: "job", status: "succeeded", resultAssetId: "src", input: { kind: "import", purpose: "remake", sourceId: "7301", prompt: "一键复刻：t", duration: 10, assets: [] } } });
  await page.loadRemakeModels();
  // The model that also takes pictures comes first: it keeps swaps best.
  assert.equal(ids(page.data.remakeModels), "both,video-only");
  assert.equal(page.data.remakeModel, "both");
  // With a picture, a pick that cannot take it says so instead of switching.
  page.chooseRemakeModel({ detail: { id: "video-only" } });
  page.setData({ assets: [{ id: "pic", isImage: true, data: { type: "image/jpeg", size: 1 } }] });
  await page.generateRemake();
  assert.equal(submitted.length, 0);
  assert.match(toasts.at(-1), /video-only 不能同时带上原视频和这些图片/);
  page.chooseRemakeModel({ detail: { id: "both" } });
  await page.generateRemake();
  assert.equal(submitted[0].model, "both");
  assert.equal(h.wx.getStorageSync("model-pick:remake"), "both", "remembered");
});

test("AI 生成服装 lists the image models that take a picture and submits with the pick", async () => {
  const h = harness(), sent = [];
  h.api.request = async (path) => (path === "/config" ? { models: [image("img-a"), image("img-b"), { ...image("text"), referenceTypes: [] }], uiArt: {} } : { items: [] });
  h.api.chooseMediaFile = async () => ({ path: "tmp/look.jpg" });
  h.api.upload = async () => ({ id: "look", data: { url: "https://oss/look.jpg", type: "image/jpeg" } });
  h.api.submitInput = async (input) => { sent.push(input); return { id: "job" }; };
  const page = h.page("tryon");
  page.onLoad();
  await page.aiMine();
  assert.equal(ids(page.data.aiSheet.models), "img-a,img-b");
  assert.equal(page.data.aiSheet.model, "img-a");
  page.aiModel({ detail: { id: "img-b" } });
  await page.aiGenerate();
  assert.equal(sent[0].model, "img-b");
  page.onUnload();
});

test("确认生成 uses the model picked on the plan card, among those that take its materials", () => {
  const h = harness();
  const { planInput, planModels } = h.service("../pages/agent/plan");
  const plan = { kind: "video", title: "t", prompt: "开场@图片1", ratio: "9:16", duration: 5, shots: [] };
  const materials = [{ id: "p1", data: { type: "image/jpeg", url: "u" } }];
  const models = [video("v-text", []), video("v-a", ["image"]), video("v-b", ["image", "video"]), { ...video("direct", ["image", "video"]), key: "ark:doubao-seedance-direct" }];
  assert.equal(ids(planModels(plan, models, materials)), "v-a,v-b");
  assert.equal(planInput(plan, models, materials, "s", "v-b").model, "v-b");
  assert.equal(planInput(plan, models, materials, "s", "v-text").model, "v-a", "a pick that no longer fits gives way");
  assert.equal(planInput(plan, models, materials, "s").model, "v-a");
});

test("文案提取 and AI写剧本 read with the chosen chat model; one that cannot take the file gives way", async () => {
  const h = harness(), sent = [];
  h.api.request = async (path) => (path === "/config" ? { models: [chat("flash", ["image"], "deepseek:deepseek-flash"), chat("seer", ["image", "video"]), chat("text", [])] } : { status: "succeeded", result: "文字" });
  h.service("jobs").submitInput = async (input) => { sent.push(input); return { id: "j", status: "succeeded", result: "文字" }; };
  const { askChat, writeScript, chatChoices } = h.service("ai-script");
  const { loadConfig } = h.service("../utils/config-cache");
  const models = (await loadConfig()).models;
  assert.equal(ids(chatChoices(models, "image")), "flash,seer", "the usual one first");
  await askChat("读图", { assets: ["a"], needs: "image", model: "seer" });
  await askChat("读视频", { assets: ["v"], needs: "video", model: "text" });
  await writeScript("写剧本", () => true, "text");
  assert.deepEqual(sent.map((i) => i.model), ["seer", "flash", "text"]);
  await settle();
});

test("the reference clip length is the model's limit (15 s when unknown)", () => {
  const { clipSeconds } = harness().service("reference-clip");
  assert.equal(clipSeconds({ referenceRules: { omni_ref: { video: { maxCount: 3, maxSizeMB: 50, maxSeconds: 30 } } } }), 30);
  assert.equal(clipSeconds({}), 15);
});

test("an original longer than the chosen model's reference limit is refused, naming a model that can take it", async () => {
  const h = harness(), submitted = [], toasts = [];
  const rules = (s) => ({ omni_ref: { video: { maxCount: 3, maxSizeMB: 50, maxSeconds: s } } });
  h.service("hot-import").remakeBrief = async () => ({ prompt: "复刻描述", width: 0, height: 0 });
  h.service("../utils/config-cache").loadConfig = async () => ({ models: [{ ...video("sd20", ["video"]), name: "Seedance 2.0", referenceRules: rules(15) }, { ...video("sd25", ["video"]), name: "Seedance 2.5", referenceRules: rules(30) }] });
  h.api.submitInput = async (input) => { submitted.push(input); return { id: "gen", input, status: "queued" }; };
  h.service("reference-clip").referenceClip = async (id) => id + "-muted";
  h.wx.showToast = (o) => toasts.push(o.title);
  const page = h.page("task-detail");
  page.setData({ swapLoaded: true, job: { id: "job", status: "succeeded", resultAssetId: "src", input: { kind: "import", purpose: "remake", sourceId: "7301", prompt: "一键复刻：t", duration: 20, assets: [] } } });
  page.chooseRemakeModel({ detail: { id: "sd20" } });
  await page.generateRemake();
  assert.equal(submitted.length, 0);
  assert.match(toasts.at(-1), /原视频 20 秒，Seedance 2\.0 最长只能参考 15 秒的视频，生成不了，可换成 Seedance 2\.5/);
  page.chooseRemakeModel({ detail: { id: "sd25" } });
  await page.generateRemake();
  assert.equal(submitted[0].model, "sd25");
  assert.equal(submitted[0].assets[0], "src-muted");
});

test("生成同款 offers the official Seedance models first: they mark pictures as references, not an opening frame", async () => {
  const h = harness();
  const official = { ...video("ark", ["image", "video"]), key: "arkvideo:doubao-seedance-2-0" };
  h.service("../utils/config-cache").loadConfig = async () => ({ models: [video("relay", ["image", "video"]), official, video("video-only", ["video"])] });
  const page = h.page("task-detail");
  page.setData({ job: { id: "job", status: "succeeded", resultAssetId: "src", input: { kind: "import", purpose: "remake", sourceId: "7301", prompt: "一键复刻：t", duration: 10, assets: [] } } });
  await page.loadRemakeModels();
  assert.equal(ids(page.data.remakeModels), "ark,relay,video-only");
  assert.equal(page.data.remakeModel, "ark");
  const { remakeInstruction } = h.service("../pages/create/remake-brief");
  const brief = remakeInstruction({ title: "t", text: "", duration: 10, images: 1, swaps: [{ name: "主角", kind: "person", look: "长发", ref: "@图片1" }] }, 10, 2000);
  assert.match(brief, /参考@视频1，保持原视频的画面比例[^]*仅将@视频1中的某人替换为@图片N中的人物[^]*人物身份严格匹配@图片N[^]*图片不作为开场画面/);
});
