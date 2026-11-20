const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// What chat models write in Markdown reads as plain lines in the chat.
const h = harness();
const { plainReply } = h.service("../utils/agent-plan");
const { streaming } = h.service("../utils/chat");

test("tables, links, code, quotes, rules and line breaks read as plain text", () => {
  assert.equal(plainReply("| 方案 | 时长 |\n|---|:---:|\n| A | 15秒 |\n| B | 10秒 |"), "方案 · 时长\n\nA · 15秒\nB · 10秒");
  assert.equal(plainReply("参考 [文档](https://example.com/a) 的做法"), "参考 文档（https://example.com/a） 的做法");
  assert.equal(plainReply("比例用 `9:16`"), "比例用 9:16");
  assert.equal(plainReply("提示词：\n```text\na cozy cafe\n```\n就这样"), "提示词：\na cozy cafe\n就这样");
  assert.equal(plainReply("> 开场这句\n第一部分\n\n---\n\n***\n第二部分"), "开场这句\n第一部分\n\n第二部分");
  assert.equal(plainReply("第一行\r\n第二行<br>第三行"), "第一行\n第二行\n第三行");
  assert.equal(plainReply("## 思路\n- **开场**：推门\n+ __结尾__"), "思路\n· 开场：推门\n· 结尾");
});

test("while streaming, only a plan block waits for its card; other code shows", () => {
  const job = { id: "s", input: { prompt: "x" } };
  const code = JSON.parse(JSON.stringify(streaming(job, "英文提示词：\n```\na cozy cafe")));
  assert.equal(code.planning, undefined);
  assert.equal(code.text, "英文提示词：\na cozy cafe");
  const plan = JSON.parse(JSON.stringify(streaming(job, "好的：\n```plan\n{\"kind\"")));
  assert.equal(plan.planning, true);
  assert.equal(plan.text, "好的：");
});

test("带到创作 carries a plan's materials, or what a plain reply's question carried", () => {
  const page = h.page("agent");
  h.wx.navigateTo = () => {};
  const { materialLabels } = h.service("../pages/agent/materials");
  const materials = materialLabels([{ id: "p1", isImage: true, data: { type: "image/png" } }, { id: "p2", isImage: true, data: { type: "image/png" } }, { id: "v1", isImage: false, data: { type: "video/mp4" } }]);
  const plan = { kind: "video", title: "t", duration: 10, ratio: "9:16", prompt: "开场@图片2", shots: [{ time: "0-3秒", scene: "推门", asset: "视频1", line: "" }] };
  page.history = [{ id: "c1", status: "succeeded", input: { kind: "chat", prompt: "分析", assets: ["p1"] } }];
  page.setData({ materials, messages: [{ id: "c1a", role: "assistant", text: "这是一张图" }, { id: "c2a", role: "assistant", plan, latest: true }] });
  page.use({ currentTarget: { dataset: { index: 0 } } });
  assert.deepEqual(JSON.parse(JSON.stringify(h.wx.getStorageSync("edit-draft").assets)), ["p1"]);
  page.use({ currentTarget: { dataset: { index: 1 } } });
  // Only what the prompt mentions, renumbered as the editor numbers it.
  const draft = h.wx.getStorageSync("edit-draft");
  assert.deepEqual(JSON.parse(JSON.stringify(draft.assets)), ["p2"]);
  assert.equal(draft.prompt, "开场@图片1");
  page.onUnload();
});
