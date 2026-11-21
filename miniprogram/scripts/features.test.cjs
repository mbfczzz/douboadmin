const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the feature grid shows every tile (no 展开) and every tile has a page", () => {
  const h = harness(), page = h.page("studio");
  const TOOLS = page.data.tools;
  assert.deepEqual(Array.from(TOOLS, (t) => t.title), ["剧情带货", "探店视频", "数字人", "图文成片", "视频唱歌", "视频二创", "文案提取", "AI证件照", "漫画推文", "AI试衣"]);
  assert.equal(page.toggleMore, undefined);
  const wxml = require("node:fs").readFileSync("pages/studio/index.wxml", "utf8");
  assert.doesNotMatch(wxml, /展开|收起|moreOpen/);
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
  assert.match(id.data.prompt, /蓝色纯色背景[^]*按一寸（25×35mm）证件照比例/);
  id.chooseOption({ currentTarget: { dataset: { key: "size", index: 1 } } });
  assert.match(id.data.prompt, /蓝色纯色背景[^]*按二寸（35×49mm）证件照比例/);
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

test("剧情带货 shows template cases (generated samples) for its keyword; a case opens 做同款 with the user's pictures", async () => {
  const h = harness(), calls = [];
  const t = (id, cover, title) => ({ id, data: { kind: "video", cover, title, duration: 5 } });
  h.api.request = async (path) => { calls.push(path); return { items: [t("tpl-1", "https://c/1.jpg", "洗衣机广告"), t("tpl-2", "", "无封面")] }; };
  const page = h.page("create");
  page.onLoad({ feature: "ad" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(calls[0], /^\/templates\?kind=video&page=1&size=10&q=%E5%B8%A6%E8%B4%A7$/);
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.featureCases)), [{ id: "tpl-1", cover: "https://c/1.jpg", title: "洗衣机广告", seconds: 5 }]);
  assert.equal(page.data.featureUpload, "上传商品图");
  // No picture yet: just the template.
  page.openCase({ currentTarget: { dataset: { id: "tpl-1" } } });
  assert.equal(h.nav[0].url, "/pages/template-detail/index?id=tpl-1");
  assert.equal(h.storage.get("template-prefill"), undefined);
  // With the product picture uploaded here it goes along (images only).
  const pic = { id: "a1", isImage: true, data: { type: "image/jpeg", url: "https://u/1.jpg" } };
  page.setData({ assets: [pic, { id: "v1", isVideo: true, data: { type: "video/mp4", url: "" } }] });
  page.openCase({ currentTarget: { dataset: { id: "tpl-1" } } });
  const handed = h.storage.get("template-prefill");
  assert.equal(handed.templateId, "tpl-1");
  assert.deepEqual(handed.assets.map((a) => a.id), ["a1"]);
  page.setData({ prompt: "写好的剧本", hasPrompt: true });
  page.clearPrompt();
  assert.equal(page.data.prompt, "");
  // Nothing matches the keyword: the newest templates instead.
  const other = harness(), asked = [];
  other.api.request = async (path) => { asked.push(path); return { items: path.endsWith("q=") ? [t("tpl-9", "https://c/9.jpg", "最新模板")] : [] }; };
  const shop = other.page("create");
  shop.onLoad({ feature: "shop" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(asked.length, 2);
  assert.equal(shop.data.featureCases[0].id, "tpl-9");
  assert.equal(shop.data.featureUpload, "上传门店图");
});

test("a template opened from 模板案例 starts with the handed-over pictures in its slots, once", async () => {
  const h = harness();
  const a1 = { id: "a1", data: { type: "image/jpeg", url: "https://u/1.jpg" } }, a2 = { id: "a2", data: { type: "image/jpeg", url: "https://u/2.jpg" } };
  h.storage.set("template-prefill", { templateId: "t", assets: [a1, a2] });
  h.api.request = async (p) => {
    if (p.startsWith("/templates/")) return { id: "t", data: { kind: "video", cover: "/cover.jpg", title: "template", requiredImages: 1, mode: "i2v", duration: 5 } };
    if (p === "/config") return { models: [] };
    throw new Error("unexpected " + p);
  };
  const page = h.page("template-detail");
  page.onLoad({ id: "t" });
  assert.equal(h.storage.get("template-prefill"), undefined);
  await page.load();
  assert.deepEqual(page.data.assets.map((a) => a.id), ["a1"]); // as many as it takes
  page.setData({ assets: [] });
  await page.load(); // a refresh does not put them back
  assert.equal(page.data.assets.length, 0);
  // Another template's hand-over is not taken.
  h.storage.set("template-prefill", { templateId: "other", assets: [a1] });
  page.onLoad({ id: "t" });
  assert.equal(h.storage.get("template-prefill").templateId, "other");
});

test("story pages: style cards, examples that fill the text, 清空 and switches", () => {
  const h = harness(), page = h.page("feature");
  page.onLoad({ key: "article" });
  const kinds = Array.from(page.data.sections, (s) => s.type);
  assert.deepEqual(kinds, ["text", "examples", "chips", "styles", "rows"]);
  const styles = page.data.sections[3];
  assert.equal(styles.picks[0].art, "styleGeneral");
  assert.equal(styles.picks.length, 5);
  page.setData = function (v) { for (const [k, val] of Object.entries(v)) { const m = /^sections\[(\d+)\]\.(\w+)$/.exec(k); if (m) this.data.sections[m[1]][m[2]] = val; else this.data[k] = val; } };
  page.example({ currentTarget: { dataset: { section: 1, index: 1 } } });
  assert.match(page.data.sections[0].value, /^凌晨两点/);
  page.clear({ currentTarget: { dataset: { section: 0 } } });
  assert.equal(page.data.sections[0].value, "");
  const remix = harness().page("feature");
  remix.onLoad({ key: "remix" });
  assert.ok(remix.data.sections.some((s) => s.type === "toggles" && s.items[0].label === "视频加结尾"));
});

test("a long original squeezed into a short remake merges overlapping beats", () => {
  const h = harness();
  const { remakePrompt } = h.service("../pages/create/remake-brief");
  const shots = Array.from({ length: 6 }, (_, i) => ({ start: i * 10, end: i * 10 + 10, scene: "场景" + i, action: "", camera: "", speech: "" }));
  const text = remakePrompt({ title: "t", text: "", duration: 60, breakdown: { hook: "", style: "", shots } }, 5, 2000);
  const lines = text.split("\n").slice(1);
  const starts = lines.map((l) => Number(l.split("–")[0]));
  assert.deepEqual(starts, [...new Set(starts)], "no repeated time ranges");
  assert.ok(lines.every((l) => /^\d+–\d+秒：/.test(l)));
  assert.match(text, /场景0[^]*场景5/);
  assert.ok(Number(lines[lines.length - 1].split("–")[1].split("秒")[0]) <= 5);
});

test("a failed 一键复刻 preparation offers 重新复刻 on the remake page", () => {
  const h = harness(), detail = h.page("task-detail");
  detail.setData({ job: { id: "j", status: "failed", input: { kind: "import", purpose: "remake", sourceId: "7301", prompt: "一键复刻：t", assets: [] } } });
  detail.remakeAgain();
  assert.equal(h.nav[0].url, "/pages/remake/index?id=7301");
});

test("interface-first pages: real uploads, option sheets, and checks before 即将开放", async () => {
  const h = harness(), toasts = [], sheets = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  h.wx.showActionSheet = (o) => { sheets.push(o.itemList); o.success({ tapIndex: 1 }); };
  h.api.chooseReferenceFile = async (kind) => ({ path: "/tmp/" + kind, name: "形象.mp4", size: 1 });
  h.api.upload = async () => ({ id: "asset-9", data: { url: "/media/v.mp4", type: "video/mp4", name: "形象.mp4", thumbnailUrl: "/media/v.jpg" } });
  const page = h.page("feature");
  page.onLoad({ key: "avatar" });
  page.setData = function (v) {
    for (const [k, val] of Object.entries(v)) {
      const m = /^sections\[(\d+)\]\.(\w+)(?:\[(\d+)\]\.(\w+))?$/.exec(k);
      if (!m) this.data[k] = val;
      else if (m[3] === undefined) this.data.sections[m[1]][m[2]] = val;
      else this.data.sections[m[1]][m[2]][m[3]][m[4]] = val;
    }
  };
  page.start();
  assert.equal(toasts.pop(), "请先上传形象视频");
  await page.upload({ currentTarget: { dataset: { section: 0 } } });
  assert.equal(page.data.sections[0].file.id, "asset-9");
  assert.equal(page.data.sections[0].uploading, false);
  page.start();
  assert.equal(toasts.pop(), "请先输入口播文案");
  page.input({ currentTarget: { dataset: { section: 1 } }, detail: { value: "大家好" } });
  page.start();
  assert.equal(toasts.pop(), "该功能即将开放");
  page.removeUpload({ currentTarget: { dataset: { section: 0 } } });
  assert.equal(page.data.sections[0].file, null);

  const story = harness();
  story.wx.showActionSheet = (o) => { sheets.push(o.itemList); o.success({ tapIndex: 1 }); };
  const article = story.page("feature");
  article.onLoad({ key: "article" });
  article.setData = page.setData;
  const rows = article.data.sections.findIndex((s) => s.type === "rows");
  article.row({ currentTarget: { dataset: { section: rows, index: 1 } } });
  assert.deepEqual(Array.from(sheets[0]), ["9:16", "16:9", "1:1", "3:4"]);
  assert.equal(article.data.sections[rows].items[1].value, "16:9");
});
