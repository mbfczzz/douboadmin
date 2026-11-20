const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// DeepSeek / 豆包: the Agent talks to the chosen chat model, shows what one
// 按量 turn can cost, and sends without a dialog per message.
function server(h, sent, modals) {
  h.wx.showModal = async () => {
    modals.n++;
    return { confirm: true };
  };
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data, statusCode = 200) => o.success({ statusCode, data });
    if (path === "/config") return ok({ models: [{ id: "ds", name: "DeepSeek", kind: "chat" }, { id: "db", name: "豆包", kind: "chat" }, { id: "img", name: "图", kind: "image" }] });
    if (path === "/jobs/quote") return ok({ units: 43, billingEnabled: true, sufficient: true, availableUnits: 1000, perToken: o.data.model === "ds" });
    if (path === "/jobs" && o.method === "POST") {
      sent.push(o.data);
      return ok({ id: "c1", status: "queued", input: o.data }, 202);
    }
    return ok({ items: [], total: 0 });
  };
}

test("Agent switches between chat models and shows the per-turn price", async () => {
  const h = harness();
  await h.api.signIn();
  const sent = [], modals = { n: 0 };
  server(h, sent, modals);
  const page = h.page("agent");
  await page.loadModels();
  assert.deepEqual(page.data.models.map((m) => m.id), ["ds", "db"]);
  assert.equal(page.data.model, "ds");
  assert.equal(page.data.priceHint, "每轮最多约 0.43 积分");
  await page.pickModel({ currentTarget: { dataset: { id: "db" } } });
  assert.equal(page.data.priceHint, "每轮 0.43 积分");
  assert.equal(h.wx.getStorageSync("agent-model"), "db");
  // The choice is remembered on the next visit.
  await page.loadModels();
  assert.equal(page.data.model, "db");
  await page.pickModel({ currentTarget: { dataset: { id: "ds" } } });
  page.setData({ session: { id: "s1", version: 1, data: { title: "项目", skill: "general", assets: [] }, assets: [] } });
  page.input({ detail: { value: "写一段咖啡店脚本" } });
  await page.send();
  assert.equal(sent[0].model, "ds");
  assert.equal(sent[0].expectedCostUnits, 43);
  assert.equal(modals.n, 0, "按量 chat sends without a dialog per message");
});

test("按量 elsewhere confirms the most a turn can cost; usage refunds read as such", async () => {
  const h = harness();
  await h.api.signIn();
  const sent = [], modals = { n: 0 };
  server(h, sent, modals);
  await h.api.submitInput({ kind: "chat", model: "ds", prompt: "写剧本", resolution: "", ratio: "", duration: 0, assets: [] }, "script");
  assert.equal(modals.n, 1);
  assert.equal(sent[0].expectedCostUnits, 43);
  const { ledgerView } = h.service("../services/wallet-ledger");
  const row = ledgerView({ id: "l", createdAt: "2026-11-20T08:00:00Z", data: { kind: "job_usage", availableDelta: 35, note: "对话按用量扣除 0.08 积分（输入 1200 / 输出 500 token）" } });
  assert.equal(row.title, "按量结算退回");
  assert.equal(row.change, "+0.35");
});

test("without a saved choice the Agent starts on DeepSeek Flash", async () => {
  const h = harness();
  await h.api.signIn();
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => o.success({ statusCode: 200, data });
    if (path === "/config") return ok({ models: [{ id: "db", key: "ark:doubao-seed", name: "豆包", kind: "chat" }, { id: "fl", key: "deepseek:deepseek-flash", name: "DeepSeek", kind: "chat", referenceTypes: ["image"] }] });
    return ok({ units: 0, billingEnabled: false });
  };
  const page = h.page("agent");
  await page.loadModels();
  assert.equal(page.data.model, "fl");
  assert.equal(page.data.sees, true);
  h.wx.setStorageSync("agent-model", "db"); // a choice the user made still wins
  await page.loadModels();
  assert.equal(page.data.model, "db");
});

test("the model picker shows each model's logo, description and price, and closes on a pick", async () => {
  const h = harness();
  await h.api.signIn();
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => o.success({ statusCode: 200, data });
    if (path === "/config")
      return ok({ models: [
        { id: "fl", key: "deepseek:deepseek-flash", name: "DeepSeek", kind: "chat", icon: "/i/ds.png", referenceTypes: ["image"], settings: { description: "反应快" } },
        { id: "pro", key: "deepseek:deepseek-v4-pro", name: "DeepSeek Pro", kind: "chat", icon: "/i/ds.png", referenceTypes: [] },
      ] });
    if (path === "/jobs/quote") return ok({ units: o.data.model === "fl" ? 17 : 74, billingEnabled: true, perToken: true });
    return ok({});
  };
  const page = h.page("agent");
  await page.loadModels();
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.current)), { id: "fl", name: "DeepSeek", key: "deepseek:deepseek-flash", icon: "/i/ds.png", desc: "反应快", rec: true, sees: true, watches: false });
  page.openModels();
  assert.equal(page.data.modelsOpen, true);
  for (let i = 0; i < 20 && !page.data.modelPrices.pro; i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.modelPrices)), { fl: "每轮最多约 0.17 积分", pro: "每轮最多约 0.74 积分" });
  await page.pickModel({ currentTarget: { dataset: { id: "pro" } } });
  assert.equal(page.data.modelsOpen, false);
  assert.equal(page.data.current.name, "DeepSeek Pro");
  assert.equal(page.data.sees, false);
  assert.equal(page.data.priceHint, "每轮最多约 0.74 积分");
});

test("a login the server forgot (guest config, no models) signs in again and sends", async () => {
  const h = harness();
  await h.api.signIn();
  let valid = false;
  const sent = [];
  const original = h.wx.request;
  h.wx.reLaunch = () => {};
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    if (path.startsWith("/auth")) return original(o);
    const ok = (data, statusCode = 200) => queueMicrotask(() => o.success({ statusCode, data }));
    if (path === "/config") return ok({ models: valid ? [{ id: "fl", key: "deepseek:deepseek-flash", name: "DeepSeek", kind: "chat" }] : [], activationRequired: true });
    if (path === "/me/identity") return valid ? ok({ id: "u" }) : ok({ error: "未登录" }, 401);
    if (path === "/jobs" && o.method === "POST") return sent.push(o.data), ok({ id: "c1", status: "queued", input: o.data }, 202);
    return ok({ items: [], total: 0 });
  };
  // The login page: signing in makes the session valid again.
  h.wx.navigateTo = (o) => {
    if (!String(o.url).startsWith("/pages/login")) return;
    valid = true;
    void h.api.signIn().then(() => h.api.completeLogin());
  };
  const page = h.page("agent");
  await page.loadModels();
  assert.equal(page.data.current, null); // the guest config has no models
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "general", assets: [] }, assets: [] }, prompt: "写个开场" });
  await page.send();
  assert.equal(sent.length, 1, "sent after signing in again");
  assert.equal(sent[0].model, "fl");
  page.onUnload();
});
