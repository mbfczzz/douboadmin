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
