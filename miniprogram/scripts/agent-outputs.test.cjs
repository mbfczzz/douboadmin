const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// What chat models actually return, beyond the ```plan contract.
const plain = (v) => JSON.parse(JSON.stringify(v));
const h = harness();
const { splitReply, plainReply } = h.service("../utils/agent-plan");
const { chatMessages } = h.service("../utils/chat");
const plan = (extra = {}) => JSON.stringify({ kind: "video", title: "春日咖啡", duration: 15, ratio: "9:16", prompt: "开场@图片1", shots: [{ time: "0-3秒", scene: "推门", asset: "图片1", line: "" }], ...extra });

test("only a question: no card, nothing broken", () => {
  assert.deepEqual(plain(splitReply("请先上传一张商品图，我再写方案。")), { text: "请先上传一张商品图，我再写方案。" });
});

test("```json blocks with a prompt count; other code blocks stay text", () => {
  const r = splitReply("方案如下：\n```json\n" + plan() + "\n```");
  assert.equal(r.plan.title, "春日咖啡");
  assert.equal(r.text, "方案如下：");
  const code = "参考格式：\n```json\n{\"a\":1}\n```";
  assert.equal(splitReply(code).plan, undefined);
  assert.equal(splitReply(code).text, code);
});

test("several blocks: the last plan wins and both leave the text", () => {
  const r = splitReply("```plan\n" + plan({ title: "初稿" }) + "\n```\n修改后：\n```plan\n" + plan({ title: "终稿" }) + "\n```");
  assert.equal(r.plan.title, "终稿");
  assert.ok(!r.text.includes("```"));
});

test("trailing commas and Chinese values are understood", () => {
  const body = plan({ kind: "图片", ratio: "竖屏", duration: "10秒", shots: [{ time: "0-3秒", scene: "海报", asset: "@图片 2、图片3", line: "" }] }).replace(/}]/, "},]");
  const r = splitReply("```plan\n" + body + "\n```");
  assert.equal(r.plan.kind, "image");
  assert.equal(r.plan.ratio, "9:16");
  assert.equal(r.plan.meta, "图片 · 9:16");
  assert.equal(r.plan.shots[0].asset, "图片2");
  assert.equal(r.plan.lead, "图片2");
  assert.equal(splitReply("```plan\n" + plan({ duration: "十五秒" }) + "\n```").plan.duration, 15);
});

test("a reply cut off inside its plan, or with unreadable JSON, reports a broken plan", () => {
  const cut = splitReply("好的，方案：\n```plan\n{\"kind\":\"video\",\"title\":\"春日");
  assert.deepEqual(plain(cut), { text: "好的，方案：", broken: true });
  const bad = splitReply("```plan\n{kind: video}\n```");
  assert.equal(bad.broken, true);
  assert.equal(bad.plan, undefined);
  const [, message] = chatMessages([{ id: "c", status: "succeeded", result: "好的，方案：\n```plan\n{\"kind", input: { kind: "chat", prompt: "做" } }]);
  assert.equal(message.broken, true);
  assert.equal(message.plan, undefined);
});

test("Markdown in prose is shown as plain lines", () => {
  assert.equal(plainReply("### 思路\n**开场**要抓人\n- 镜头一\n- 镜头二\n\n\n\n结尾"), "思路\n开场要抓人\n· 镜头一\n· 镜头二\n\n结尾");
});

test("generation cards: status, picture count and a finished video without a cover", () => {
  const messages = plain(chatMessages([
    { id: "img", status: "succeeded", result: "/m/1.png", results: ["/m/1.png", "/m/2.png", "/m/3.png", "/m/4.png"], input: { kind: "image", sessionId: "s" } },
    { id: "vid", status: "succeeded", input: { kind: "video", sessionId: "s" } },
    { id: "q", status: "queued", input: { kind: "video", sessionId: "s" } },
    { id: "f", status: "failed", error: "参考视频超过 15 秒", input: { kind: "video", sessionId: "s" } },
    { id: "other", status: "succeeded", input: { kind: "video" } }, // not from this project's plans
  ]));
  assert.deepEqual(messages.map((m) => [m.text, m.gen.status, m.gen.thumb, m.gen.count]), [
    ["f", "failed", "", 0],
    ["q", "queued", "", 0],
    ["vid", "succeeded", "", 1],
    ["img", "succeeded", "/m/1.png", 4],
  ]);
  const wxml = require("node:fs").readFileSync("pages/agent/parts/messages.wxml", "utf8");
  assert.match(wxml, /wx:elif="\{\{item\.gen\.status==='succeeded'\}\}" class="gl gl-20"/); // a kind icon, not the error mark
});

test("plan mentions are renumbered to the materials actually sent", () => {
  const { sentMaterials } = h.service("../pages/agent/plan");
  const assets = [
    { id: "p1", data: { type: "image/png" } },
    { id: "v1", data: { type: "video/mp4" } },
    { id: "p2", data: { type: "image/jpeg" } },
    { id: "p3", data: { type: "image/jpeg" } },
  ];
  const sent = plain(sentMaterials("开场@图片3，中段@视频1，结尾@图片3特写，再看@图片9", assets));
  assert.deepEqual(sent.assets.map((a) => a.id), ["v1", "p3"]);
  assert.equal(sent.prompt, "开场@图片1，中段@视频1，结尾@图片1特写，再看图片9");
  assert.equal(plain(sentMaterials("@图片1 和 @图片10", assets)).assets.length, 1, "图片10 is not 图片1");
});

test("a message sends only the pictures it names; a waiting reply shows its seconds", () => {
  const { namedPictures } = h.service("../pages/agent/named");
  const m = [{ id: "a", isImage: true, label: "图片1" }, { id: "v", isImage: false, label: "视频1" }, { id: "b", isImage: true, label: "图片2" }];
  assert.deepEqual(plain(namedPictures("分析图片2", m)), ["b"]);
  assert.deepEqual(plain(namedPictures("@图片1 和 图片 2 对比", m)), ["a", "b"]);
  assert.deepEqual(plain(namedPictures("写个开场", m)), []);
  assert.deepEqual(plain(namedPictures("分析这张图", m.slice(0, 2))), ["a"]); // the only picture
  const [, waiting] = chatMessages([{ id: "w", status: "running", createdAt: new Date(Date.now() - 12000).toISOString(), input: { kind: "chat", prompt: "做" } }]);
  assert.equal(waiting.text, "正在构思… 已 12 秒");
});

test("a reply being written shows its prose so far, then a plan placeholder", () => {
  const job = { id: "s", status: "running", input: { kind: "chat", prompt: "做" } };
  const [, early] = plain(chatMessages([job], { s: "好的，**开场**先推门" }));
  assert.equal(early.text, "好的，开场先推门");
  assert.equal(early.streaming, true);
  assert.equal(early.pending, true);
  assert.equal(early.planning, undefined);
  const [, planning] = plain(chatMessages([job], { s: "好的。\n```plan\n{\"kind\":\"vi" }));
  assert.equal(planning.text, "好的。");
  assert.equal(planning.planning, true);
  assert.equal(planning.plan, undefined);
  const [, done] = plain(chatMessages([{ ...job, status: "succeeded", result: "好的" }], { s: "好" }));
  assert.equal(done.streaming, undefined); // the finished reply replaces the partial
});
