const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const plain = (v) => JSON.parse(JSON.stringify(v));
const PLAN = { kind: "video", title: "春日咖啡", duration: 12, ratio: "9:16", prompt: "开场@图片2推门进店，特写拉花", shots: [{ time: "0-3秒", scene: "推门", asset: "图片2", line: "周末好去处" }] };
const reply = (plan) => "给你一版方案：\n```plan\n" + JSON.stringify(plan) + "\n```";
const materials = [
  { id: "p1", isImage: true, data: { type: "image/png", url: "/m/1.png" } },
  { id: "v1", isImage: false, data: { type: "video/mp4", url: "/m/v.mp4" } },
  { id: "p2", isImage: true, data: { type: "image/jpeg", url: "/m/2.jpg" } },
];
const models = [
  { id: "t2v", name: "只文生", kind: "video", modes: ["t2v"], referenceTypes: [], durations: [5, 10], ratios: ["9:16"], resolutions: ["720p"] },
  { id: "omni", name: "全能参考", kind: "video", modes: ["t2v", "omni_ref"], referenceTypes: ["image", "video"], durations: [5, 10, 15], ratios: ["9:16", "16:9"], resolutions: ["720p"] },
];

test("a reply's plan block becomes a card; only the newest plan can generate", () => {
  const h = harness();
  const { splitReply } = h.service("../utils/agent-plan");
  const { chatMessages } = h.service("../utils/chat");
  const split = splitReply(reply(PLAN));
  assert.equal(split.text, "给你一版方案：");
  assert.equal(split.plan.meta, "视频 · 12 秒 · 9:16");
  assert.equal(splitReply("```plan\n{broken\n```").plan, undefined);
  const jobs = [
    { id: "gen", status: "running", progress: 40, input: { kind: "video", sessionId: "s1", prompt: "x" } },
    { id: "c2", status: "succeeded", result: reply({ ...PLAN, title: "第二版" }), input: { kind: "chat", prompt: "改开场" } },
    { id: "c1", status: "succeeded", result: reply(PLAN), input: { kind: "chat", prompt: "做探店" } },
  ];
  const messages = plain(chatMessages(jobs));
  const plans = messages.filter((m) => m.plan);
  assert.deepEqual(plans.map((m) => [m.plan.title, !!m.latest, m.version]), [["春日咖啡", false, 1], ["第二版", true, 2]]);
  // 复制 gives the plan as lines, not JSON; a reply with nothing to copy has no button.
  assert.equal(plans[1].copy, "给你一版方案：\n\n【第二版】视频 · 12 秒 · 9:16\n0-3秒 推门 “周末好去处” （图片2）");
  assert.match(require("node:fs").readFileSync("pages/agent/parts/messages.wxml", "utf8"), /wx:if="\{\{item\.copy&&\(item\.latest\|\|!item\.plan\|\|item\.text\)\}\}" class="reply-icon"/);
  assert.deepEqual(messages.at(-1).gen, { status: "running", progress: 40, kind: "video", thumb: "", error: "", count: 0 });
});

test("a plan generates on the first model taking its materials, sending only the mentioned ones", () => {
  const h = harness();
  const { planInput } = h.service("../pages/agent/plan");
  const input = plain(planInput(PLAN, models, materials, "s1"));
  assert.equal(input.model, "omni"); // 只文生 cannot take @图片2
  assert.deepEqual(input.assets, ["p2"]); // 图片2 is the second picture, not the third material
  assert.equal(input.prompt, "开场@图片1推门进店，特写拉花"); // renumbered: it is the only picture sent
  assert.equal(input.duration, 10); // 12 s snaps to the nearest supported length
  assert.equal(input.sessionId, "s1");
  assert.equal(plain(planInput({ ...PLAN, prompt: "纯文字" }, models, materials, "s1")).model, "t2v");
  assert.throws(() => planInput(PLAN, [models[0]], materials, "s1"), /暂无支持这些素材的模型/);
});

test("确认生成 asks for the points once and adds the generation to the project", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const sent = [];
  let modals = 0;
  h.wx.showModal = async () => (modals++, { confirm: true });
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data, statusCode = 200) => o.success({ statusCode, data });
    if (path === "/config") return ok({ models });
    if (path === "/jobs/quote") return ok({ units: 3500, billingEnabled: true, sufficient: true, availableUnits: 9000 });
    if (path === "/jobs" && o.method === "POST") return sent.push(o.data), ok({ id: "gen", status: "queued", input: o.data }, 202);
    return ok({ items: [], total: 0 });
  };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] }, materials });
  page.setData({ messages: [{ id: "a", role: "assistant", plan: PLAN, latest: false }, { id: "b", role: "assistant", plan: PLAN, latest: true }] });
  await page.generatePlan({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(sent.length, 0, "a revised plan cannot generate");
  await page.generatePlan({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(modals, 1);
  assert.equal(sent[0].sessionId, "s1");
  assert.equal(sent[0].expectedCostUnits, 3500);
  page.onUnload();
});

test("attachments go with their message only; pictures need a model that sees them", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const { materialLabels } = h.service("../pages/agent/materials");
  const labelled = materialLabels(materials);
  assert.deepEqual(labelled.map((m) => m.label), ["图片1", "视频1", "图片2"]);
  const sent = [], toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data, statusCode = 200) => o.success({ statusCode, data });
    if (path === "/config") return ok({ models: [{ id: "ds", name: "DeepSeek Pro", kind: "chat", referenceTypes: [] }, { id: "db", kind: "chat", referenceTypes: ["image"] }] });
    if (path === "/jobs/quote") return ok({ units: 5, billingEnabled: true, sufficient: true, availableUnits: 100, perToken: true });
    if (path === "/jobs" && o.method === "POST") return sent.push(o.data), ok({ id: "c" + sent.length, status: "succeeded", result: "好", input: o.data }, 202);
    return ok({ items: [], total: 0 });
  };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] }, materials: labelled, model: "ds", prompt: "对比一下", attached: [labelled[0], labelled[2]] });
  await page.send(); // a text-only model cannot take the pictures
  assert.equal(sent.length, 0);
  assert.match(toasts.join(), /DeepSeek Pro 看不到图片/);
  page.setData({ model: "db" });
  await page.send();
  assert.deepEqual(plain(sent[0].assets), ["p1", "p2"]);
  assert.equal(page.data.attached.length, 0, "the next message starts without them");
  page.setData({ attached: [labelled[1]], prompt: "" }); // a video alone: analysed (视频理解), any model
  page.setData({ model: "ds" });
  await page.send();
  assert.deepEqual(plain(sent[1].assets), ["v1"]);
  assert.equal(sent[1].prompt, "分析这个视频");
  page.setData({ prompt: "再写个开场" });
  await page.send();
  assert.deepEqual(plain(sent[2].assets), [], "nothing attached, nothing sent");
  page.onUnload();
});

test("the newest plan shows its points on 确认生成, quoted once per plan and materials", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  let quotes = 0;
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => o.success({ statusCode: 200, data });
    if (path === "/config") return ok({ models });
    if (path === "/jobs/quote") return quotes++, ok({ units: 3500, billingEnabled: true });
    return ok({ items: [], total: 0 });
  };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] }, materials });
  page.setData({ messages: [{ id: "old", role: "assistant", plan: PLAN, latest: false }, { id: "new", role: "assistant", plan: PLAN, latest: true }] });
  await page.priceLatest();
  await page.priceLatest();
  assert.deepEqual(plain(page.data.planPrice), { id: "new", text: "35 积分" });
  assert.equal(quotes, 1, "the same plan and materials are not quoted twice");
  page.setData({ materials: materials.slice(0, 1) });
  await page.priceLatest();
  assert.equal(quotes, 2, "changing the materials quotes again (it can change the model)");
  page.setData({ messages: [{ id: "x", role: "assistant", plan: PLAN, latest: true }] });
  h.wx.request = (o) => (o.url.endsWith("/config") ? o.success({ statusCode: 200, data: { models: [] } }) : o.fail({ errMsg: "x" }));
  await page.priceLatest();
  assert.deepEqual(plain(page.data.planPrice), { id: "x", text: "" }, "no fitting model: the price hides");
  page.onUnload();
});

test("a project named after its skill takes its first plan's title; an attachment can be taken off", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const puts = [];
  let modals = 0, answer = false;
  h.wx.showModal = async () => (modals++, { confirm: answer });
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    if (o.method === "PUT") return puts.push(o.data), o.success({ statusCode: 200, data: { id: "s1", version: 2, data: { title: o.data.title || "店", skill: "store", assets: o.data.assets || [] } } });
    o.success({ statusCode: 200, data: path === "/config" ? { models } : { items: [], total: 0 } });
  };
  page.setData({ skills: [{ id: "store", name: "探店视频" }], projects: [{ id: "s1", version: 1, data: { title: "探店视频", skill: "store" } }] });
  page.setData({ session: { id: "s1", version: 1, data: { title: "探店视频", skill: "store", assets: [] }, assets: [] }, messages: [{ id: "a", role: "assistant", plan: PLAN, latest: true }] });
  await page.autoTitle();
  assert.equal(puts[0].title, "春日咖啡");
  assert.equal(page.data.session.data.title, "春日咖啡");
  assert.equal(page.data.projects[0].data.title, "春日咖啡");
  await page.autoTitle(); // renamed already: no second request
  assert.equal(puts.length, 1);
  // × on a fresh attachment takes it off the message and the project.
  const labelled = h.service("../pages/agent/materials").materialLabels(materials);
  page.setData({ materials: labelled, attached: [{ ...labelled[2], fresh: true }] });
  await page.detach({ currentTarget: { dataset: { id: "p2" } } });
  assert.deepEqual(plain(puts[1].assets), ["p1", "v1"]);
  assert.equal(page.data.attached.length, 0);
  assert.equal(modals, 0);
  page.onUnload();
});

test("several pictures upload in one pick and attach to the message", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  let picked;
  h.wx.chooseMedia = async (o) => ((picked = o.count), { tempFiles: [{ tempFilePath: "a.jpg", size: 1 }, { tempFilePath: "b.jpg", size: 1 }] });
  let n = 0;
  h.api.upload = async () => ({ id: "u" + ++n, data: { type: "image/jpeg", url: "/m/u" + n + ".jpg" } });
  const puts = [];
  h.wx.request = (o) => (o.method === "PUT" && puts.push(o.data), o.success({ statusCode: 200, data: { id: "s1", version: 2, data: { title: "店", skill: "store", assets: (o.data || {}).assets || [] } } }));
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] }, materials: [] });
  await page.addMaterial({ currentTarget: { dataset: { kind: "image" } } });
  assert.equal(picked, 9);
  assert.deepEqual(plain(puts[0].assets), ["u1", "u2"]);
  assert.deepEqual(plain(page.data.attached.map((m) => m.label)), ["图片1", "图片2"], "attached to the message being written");
  page.onUnload();
});

test("an earlier plan opens and can be used", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const sent = [];
  h.wx.showModal = async () => ({ confirm: true });
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data, statusCode = 200) => o.success({ statusCode, data });
    if (path === "/config") return ok({ models });
    if (path === "/jobs/quote") return ok({ units: 100, billingEnabled: true, sufficient: true, availableUnits: 900 });
    if (path === "/jobs" && o.method === "POST") return sent.push(o.data), ok({ id: "g", status: "queued", input: o.data }, 202);
    return ok({ items: [], total: 0 });
  };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] }, materials });
  page.setData({ messages: [{ id: "old", role: "assistant", plan: { ...PLAN, title: "初稿" }, latest: false }, { id: "new", role: "assistant", plan: PLAN, latest: true }] });
  await page.generatePlan({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(sent.length, 0, "folded: not usable");
  page.togglePlan({ currentTarget: { dataset: { id: "old" } } });
  assert.equal(page.data.expanded.old, true);
  await page.generatePlan({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(sent.length, 1, "opened: 用这一版生成");
  page.togglePlan({ currentTarget: { dataset: { id: "old" } } });
  assert.equal(page.data.expanded.old, false);

  page.onUnload();
});

test("新建 goes back to the skill picker and stays there on the next visit", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const list = [{ id: "s1", version: 1, data: { title: "春日咖啡", skill: "store", assets: [], activeAt: "2026-11-20T06:00:00Z" } }];
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => o.success({ statusCode: 200, data });
    if (path === "/agent/sessions") return ok(list);
    if (path === "/agent/skills") return ok([{ id: "store", name: "探店视频" }]);
    if (path === "/agent/sessions/s1") return ok({ ...list[0], assets: [] });
    return ok({ items: [], total: 0 });
  };
  await page.loadSession();
  assert.equal(page.data.session.id, "s1"); // the most recent project opens
  await page.startOver();
  assert.equal(page.data.session, null);
  assert.equal(page.data.messages.length, 0);
  await page.loadSession(); // e.g. back from another tab
  assert.equal(page.data.session, null, "the picker is kept");
  assert.equal(page.data.projects.length, 1, "the project is still in the list");
  await page.switchProject({ currentTarget: { dataset: { id: "s1" } } });
  assert.equal(page.data.session.id, "s1");
  page.onUnload();
});

test("signed out, the picker still lists the skills; a failed first load can be retried", async () => {
  const h = harness();
  const page = h.page("agent");
  let fail = true;
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    if (path === "/agent/skills") return fail ? o.success({ statusCode: 500, data: { error: "服务繁忙" } }) : o.success({ statusCode: 200, data: [{ id: "store", name: "探店视频" }] });
    o.success({ statusCode: 200, data: [] });
  };
  await page.loadSession().catch((e) => page.setData({ projectsError: e.message }));
  assert.ok(page.data.projectsError);
  fail = false;
  page.retryProjects();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(page.data.projectsReady, true);
  assert.equal(page.data.projectsError, "");
  assert.equal(page.data.skills[0].name, "探店视频");
  page.onUnload();
});
