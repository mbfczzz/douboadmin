const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const plain = (v) => JSON.parse(JSON.stringify(v));

test("key lines of a reply become copy chips", () => {
  const { keyContent } = harness().service("../utils/snippets");
  const reply = [
    "给你三个方向：",
    "1. 标题：周末去哪儿？这家店藏不住了",
    "· 口播：“推门的那一刻，咖啡香先到了”",
    "字幕写成「这辆货车申报的是不是海鲜」更抓人。",
    "#探店 #咖啡 #周末去哪儿",
    "```",
    "a cozy cafe, warm light, 35mm",
    "```",
    "名字叫“山河”就好。", // too short to be worth a chip
  ].join("\n");
  assert.deepEqual(plain(keyContent(reply)), [
    "a cozy cafe, warm light, 35mm",
    "周末去哪儿？这家店藏不住了",
    "推门的那一刻，咖啡香先到了",
    "#探店 #咖啡 #周末去哪儿",
    "这辆货车申报的是不是海鲜",
  ]);
  assert.deepEqual(plain(keyContent("好的，没问题。")), []);
  const { chatMessages } = harness().service("../utils/chat");
  const [, a] = plain(chatMessages([{ id: "c", status: "succeeded", result: "标题：春日咖啡馆", input: { kind: "chat", prompt: "起个标题" } }]));
  assert.deepEqual(a.snippets, ["春日咖啡馆"]);
});

test("编辑 brings a sent question back; sending asks again and revises it", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const sent = [];
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data, statusCode = 200) => o.success({ statusCode, data });
    if (path === "/config") return ok({ models: [{ id: "db", kind: "chat", referenceTypes: ["image"] }] });
    if (path === "/jobs" && o.method === "POST") return sent.push(o.data), ok({ id: "c2", status: "succeeded", result: "好", input: o.data }, 202);
    return ok({ items: [], total: 0 });
  };
  const { materialLabels } = h.service("../pages/agent/materials");
  const materials = materialLabels([{ id: "p1", isImage: true, data: { url: "/1.png" } }, { id: "p2", isImage: true, data: { url: "/2.png" } }, { id: "v1", isImage: false, data: { url: "/v.mp4", thumbnailUrl: "/v.jpg" } }]);
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "general", assets: [] }, assets: [] }, materials, model: "db" });
  page.history = [{ id: "c1", status: "succeeded", result: "旧回答", input: { kind: "chat", prompt: "分析这张图片", assets: ["p2", "v1"], sessionId: "s1" } }];
  page.editMessage({ currentTarget: { dataset: { id: "c1u" } } });
  assert.equal(page.data.prompt, "分析这张图片");
  // The picture and the video it carried come back with their names.
  assert.deepEqual(plain(page.data.attached.map((m) => [m.id, m.label])), [["p2", "图片2"], ["v1", "视频1"]]);
  assert.equal(page.data.editing, "c1");
  page.setData({ prompt: "分析这张图片的配色" });
  await page.send();
  assert.equal(sent[0].revises, "c1");
  assert.deepEqual(plain(sent[0].assets), ["p2", "v1"]);
  assert.equal(page.data.editing, "");
  // A plain message afterwards revises nothing; 取消 clears an edit.
  page.setData({ prompt: "再来一版" });
  await page.send();
  assert.equal(sent[1].revises, undefined);
  // A file since removed from the project is said, not silently dropped.
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  page.history = [{ id: "c1", status: "succeeded", result: "旧回答", input: { kind: "chat", prompt: "分析这张图片", assets: ["p2", "gone"], sessionId: "s1" } }];
  page.editMessage({ currentTarget: { dataset: { id: "c1u" } } });
  assert.deepEqual(plain(page.data.attached.map((m) => m.id)), ["p2"]);
  assert.match(toasts.join(), /有 1 个附件已从项目移除/);
  page.cancelEdit();
  assert.equal(page.data.editing, "");
  assert.equal(page.data.prompt, "");
  page.onUnload();
});
