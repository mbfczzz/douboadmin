const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("a skill starts a project and fills the composer; replies copy in one tap", async () => {
  const h = harness(),
    page = h.page("agent"),
    copied = [];
  await h.api.signIn();
  h.wx.request = (o) => o.success({ statusCode: 201, data: { id: "p1", version: 1, data: { title: "商品带货视频", skill: o.data.skill, assets: [] } } });
  page.setData({ skills: [{ id: "product", name: "商品带货视频", hint: "上传商品图", icon: "shop", kind: "video", starter: "帮我做一条 15 秒的商品种草视频，突出" }] });
  await page.newProject({ currentTarget: { dataset: { id: "product" } } });
  assert.equal(page.data.session.id, "p1");
  assert.equal(page.data.prompt, "帮我做一条 15 秒的商品种草视频，突出");
  assert.equal(page.data.focus, true);
  assert.equal(page.data.projects[0].id, "p1");
  page.blur();
  assert.equal(page.data.focus, false);
  h.wx.setClipboardData = (o) => copied.push(o.data);
  page.copy({ currentTarget: { dataset: { text: "镜头 1：清晨街角" } } });
  assert.deepEqual(copied, ["镜头 1：清晨街角"]);
});

test("script replies split into shot labels; failures offer to edit the question", () => {
  const h = harness(),
    { chatMessages, scriptLines } = h.service("../utils/chat");
  assert.deepEqual(JSON.parse(JSON.stringify(scriptLines("镜头 1（0–3 秒）：清晨街角\n\n【结尾】字幕：开业啦\n普通一句"))), [
    { label: "镜头 1（0–3 秒）", text: "清晨街角" },
    { label: "", text: "" },
    { label: "结尾", text: "字幕：开业啦" },
    { label: "", text: "普通一句" },
  ]);
  const [, failed] = chatMessages([{ id: "j", status: "failed", error: "模型繁忙", input: { kind: "chat", prompt: "写个脚本" } }]);
  assert.equal(failed.failed, true);
  assert.equal(failed.text, "模型繁忙");
  assert.equal(failed.lines.length, 0);
  const page = h.page("agent");
  page.retry({ currentTarget: { dataset: { prompt: failed.prompt } } });
  assert.equal(page.data.prompt, "写个脚本");
  assert.equal(page.data.focus, true);
  assert.equal(page.data.followUps.length, 0); // no fixed video chips; they come from the plan
});

test("quick revisions fit the plan: no 秒 or 开场 for a picture, and never its current orientation", () => {
  const { planAsks, splitReply } = harness().service("../utils/agent-plan");
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const image = { kind: "image", title: "关羽动漫形象", duration: 5, ratio: "9:16", prompt: "p", shots: [] };
  assert.deepEqual(plain(planAsks(image)), ["换一个构图", "换一种画风", "改成横版 16:9"]);
  assert.deepEqual(plain(planAsks({ ...image, ratio: "16:9" })), ["换一个构图", "换一种画风", "改成竖版 9:16"]);
  const video = { ...image, kind: "video", duration: 15 };
  assert.deepEqual(plain(planAsks(video)), ["缩短到 10 秒", "换一个开场", "改成横屏"]);
  assert.deepEqual(plain(planAsks({ ...video, duration: 8, ratio: "16:9" })), ["加长到 15 秒", "换一个开场", "改成竖屏"]);
  const reply = splitReply('说明\n```plan\n{"kind":"image","title":"关羽","ratio":"9:16","prompt":"国风关羽半身像"}\n```');
  assert.ok(!reply.plan.asks.some((a) => /秒|开场/.test(a)));
});
