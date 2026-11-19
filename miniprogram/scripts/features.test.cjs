const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the feature grid shows nine tiles before 展开 and every tile has a page", () => {
  const h = harness(), page = h.page("studio");
  const TOOLS = page.data.tools, FIRST_TOOLS = page.data.firstTools;
  assert.equal(FIRST_TOOLS, 9);
  assert.deepEqual(Array.from(TOOLS.slice(0, 9), (t) => t.title), ["剧情带货", "探店视频", "数字人", "图文成片", "视频唱歌", "视频二创", "文案提取", "AI证件照", "视频去字幕"]);
  page.toggleMore();
  assert.equal(page.data.moreOpen, true);
  for (const tool of TOOLS.filter((t) => t.url.startsWith("/pages/feature/"))) {
    const feature = harness().page("feature");
    feature.onLoad({ key: tool.url.split("key=")[1] });
    assert.equal(feature.data.title, tool.title);
    assert.ok(feature.data.sections.length && feature.data.action);
  }
});

test("剧情带货 and AI证件照 are editor presets with their own kind and prompt", () => {
  const h = harness();
  const ad = h.page("create");
  ad.onLoad({ feature: "ad" });
  assert.equal(ad.data.kind, "video");
  assert.equal(ad.data.featureTitle, "剧情带货");
  assert.equal(ad.data.featureScript, true);
  const id = harness().page("create");
  id.onLoad({ feature: "idphoto" });
  assert.equal(id.data.kind, "image");
  assert.match(id.data.prompt, /^将@图片1中的人物生成标准证件照.*白色纯色背景/);
  id.chooseOption({ currentTarget: { dataset: { key: "bg", index: 1 } } });
  assert.match(id.data.prompt, /蓝色纯色背景/);
});

test("AI写剧本 asks the chat model and puts its reply in the prompt", async () => {
  const h = harness(), sent = [];
  h.service("../utils/config-cache").loadConfig = async () => ({ models: [{ id: "chat-1", kind: "chat" }] });
  h.service("jobs").submitInput = async (input) => { sent.push(input); return { id: "j1", status: "succeeded", result: " 女生拿起@图片1 的面霜… " }; };
  const page = h.page("create");
  page.visible = true;
  page.onLoad({ feature: "ad" });
  page.setData({ prompt: "面霜，冬天保湿", assets: [{ id: "a", isImage: true, data: { url: "u" } }] });
  await page.aiScript();
  assert.equal(sent[0].kind, "chat");
  assert.match(sent[0].prompt, /剧情带货短视频[^]*@图片1[^]*面霜，冬天保湿/);
  assert.equal(page.data.prompt, "女生拿起@图片1 的面霜…");
  assert.equal(page.data.scriptBusy, false);
});

test("文案提取 turns a share link into its caption and can start a video from it", async () => {
  const h = harness(), calls = [];
  h.api.request = async (path, method, body) => { calls.push([path, method, body]); return { id: "1", title: "标题", author: "作者", text: "视频文案" }; };
  const page = h.page("extract");
  page.choose({ currentTarget: { dataset: { key: "link" } } });
  assert.equal(page.data.linkOpen, true);
  page.input({ detail: { value: "复制打开抖音 https://v.douyin.com/abc/" } });
  await page.extract();
  assert.deepEqual(calls[0].slice(0, 2), ["/hot/link", "POST"]);
  assert.equal(page.data.video.text, "视频文案");
  page.create();
  assert.equal(h.storage.get("edit-draft").prompt, "视频文案");
  assert.equal(h.nav[0].url, "/pages/create/index");
  await settle();
});

test("an ID photo needs a photo, and presets start on a model that takes pictures", async () => {
  const h = harness();
  const page = h.page("create");
  page.onLoad({ feature: "idphoto" });
  const { featureProblem, featureModel } = h.service("../pages/create/feature");
  assert.equal(featureProblem(page.data), "请先上传一张本人照片");
  assert.equal(featureProblem({ ...page.data, assets: [{ isImage: true }] }), "");
  assert.equal(featureProblem({ feature: "", assets: [] }), "");
  const text = { id: "t", kind: "image", referenceTypes: [] }, picture = { id: "p", kind: "image", referenceTypes: ["image"] };
  assert.equal(featureModel([text, picture], "idphoto").id, "p");
  assert.equal(featureModel([text, picture], ""), undefined);
});

test("the 一键复刻 preset needs its video and starts on a model that takes videos", () => {
  const h = harness();
  const { featureProblem, featureModel } = h.service("../pages/create/feature");
  assert.equal(featureProblem({ feature: "remake", assets: [{ isImage: true }] }), "请先带入要复刻的视频");
  assert.equal(featureProblem({ feature: "remake", assets: [{ isVideo: true }] }), "");
  const image = { id: "i", kind: "video", referenceTypes: ["image"] }, video = { id: "v", kind: "video", referenceTypes: ["image", "video"] };
  assert.equal(featureModel([image, video], "remake").id, "v");
  assert.equal(featureModel([image, video], "ad").id, "i");
});

test("一键复刻 writes a shot-by-shot description from the original once", async () => {
  const h = harness(), sent = [];
  h.service("../utils/config-cache").loadConfig = async () => ({ models: [{ id: "chat-1", kind: "chat" }] });
  h.service("jobs").submitInput = async (input) => { sent.push(input); return { id: "j1", status: "succeeded", result: "镜头1：……" }; };
  h.storage.set("remake-source", { title: "三分钟学会一道家常菜", text: "番茄炒蛋的秘诀 #美食", duration: 23.4 });
  h.storage.set("edit-draft", { kind: "video", prompt: "参考@视频1……", ratio: "9:16", resolution: "", duration: 10, assets: [] });
  const page = h.page("create");
  page.visible = true;
  page.restoreAssets = async () => undefined;
  page.loadModels = async () => undefined;
  page.onLoad({ feature: "remake" });
  page.onShow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, 1);
  assert.match(sent[0].prompt, /复刻编剧[^]*三分钟学会一道家常菜[^]*番茄炒蛋的秘诀[^]*约 23 秒[^]*生成时长为 10 秒[^]*@视频1/);
  assert.equal(page.data.prompt, "镜头1：……");
  assert.equal(h.storage.has("remake-source"), false);
  page.onShow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, 1, "only once");
});

test("without a chat model the remake description is skipped quietly", async () => {
  const h = harness(), toasts = [], sent = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  h.service("../utils/config-cache").loadConfig = async () => ({ models: [{ id: "v", kind: "video" }] });
  h.service("jobs").submitInput = async (input) => { sent.push(input); return { id: "j", status: "succeeded", result: "x" }; };
  h.storage.set("remake-source", { title: "t", text: "", duration: 8 });
  const page = h.page("create");
  page.visible = true;
  page.onLoad({ feature: "remake" });
  const { startFeatureScript } = h.service("../pages/create/feature");
  await startFeatureScript(page);
  assert.deepEqual(sent, []);
  assert.deepEqual(toasts, []);
  assert.equal(h.storage.has("remake-source"), false);
});

test("an unsupported length takes the closest the model offers", () => {
  const h = harness();
  const { modelSettings } = h.service("../pages/create/models");
  const model = { id: "m", kind: "video", durations: [5, 10, 15], resolutions: [], ratios: [] };
  const pick = (duration) => modelSettings(model, { resolution: "", ratio: "9:16", duration }).duration;
  assert.equal(pick(23), 15);
  assert.equal(pick(7), 5);
  assert.equal(pick(9), 10);
  assert.equal(pick(10), 10);
});

test("the remake brief follows the video breakdown and swaps in the user's pictures", () => {
  const h = harness();
  const { remakeInstruction } = h.service("../pages/create/remake-brief");
  const source = { title: "开箱口红", text: "", duration: 18, images: 2, breakdown: { summary: "深夜开箱", hook: "撕快递盒", structure: "开箱→试色→下单", sellingPoints: ["显白"], style: "手持暖光", music: "轻快", shots: [{ start: 0, end: 2.5, scene: "卧室书桌", action: "撕开快递", camera: "手持中景", speech: "" }, { start: 2.5, end: 6, scene: "镜前", action: "试色", camera: "特写", speech: "黄皮也能涂" }] } };
  const text = remakeInstruction(source, 10, 500);
  assert.match(text, /视频理解模型对原视频的拆解[^]*开头钩子：撕快递盒[^]*0–2.5秒｜场景：卧室书桌｜动作：撕开快递｜镜头：手持中景\n2.5–6秒[^]*台词\/字幕：黄皮也能涂/);
  assert.match(text, /生成时长为 10 秒[^]*前 3 秒[^]*@图片1、@图片2[^]*@视频1/);
  const plain = remakeInstruction({ title: "t", text: "文案", duration: 8 }, 5, 300);
  assert.match(plain, /未能拆解画面[^]*文案：文案[^]*不要照搬原作者/);
});
