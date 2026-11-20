const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const plain = (v) => JSON.parse(JSON.stringify(v));
const row = (id, assets = []) => ({ id, version: 1, data: { title: id, skill: "general", assets, activeAt: "" } });

test("a project started by the first message is the one shown next visit", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data, statusCode = 200) => o.success({ statusCode, data });
    if (path === "/config") return ok({ models: [{ id: "db", kind: "chat", referenceTypes: ["image"] }] });
    if (path === "/agent/sessions" && o.method === "POST") return ok(row("p9"));
    if (path === "/jobs" && o.method === "POST") return ok({ id: "c1", status: "queued", input: o.data }, 202);
    return ok({ items: [], total: 0 });
  };
  page.setData({ session: null, prompt: "写个开场" });
  await page.send();
  assert.equal(h.wx.getStorageSync("agent-session").id, "p9");
  page.onUnload();
});

test("switching or starting a project resumes checking and starts an empty draft", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  let polls = 0;
  page.poll = () => polls++;
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => o.success({ statusCode: 200, data });
    if (path === "/agent/sessions/s2") return ok({ ...row("s2"), assets: [] });
    if (path === "/agent/sessions" && o.method === "POST") return ok(row("s3"));
    return ok({ items: [], total: 0 });
  };
  page.setData({ session: { ...row("s1"), assets: [] }, attached: [{ id: "p1" }], editing: "c1", skills: [{ id: "store", name: "探店", starter: "" }] });
  await page.switchProject({ currentTarget: { dataset: { id: "s2" } } });
  assert.equal(polls, 1);
  page.setData({ attached: [{ id: "p1" }], editing: "c1", files: { p1: {} } });
  await page.newProject({ currentTarget: { dataset: { id: "store" } } });
  assert.equal(polls, 2);
  assert.deepEqual(plain([page.data.attached, page.data.editing, page.data.files]), [[], "", {}]);
  page.onUnload();
});

test("编辑 or 取消 gives up the draft: files uploaded only for it leave the project", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const puts = [];
  h.wx.request = (o) => (o.method === "PUT" && puts.push(o.data.assets), o.success({ statusCode: 200, data: { id: "s1", version: 2, data: { assets: (o.data || {}).assets || [] } } }));
  const { materialLabels } = h.service("../pages/agent/materials");
  const materials = materialLabels([{ id: "p1", isImage: true, data: { url: "/1" } }, { id: "p2", isImage: true, data: { url: "/2" } }]);
  page.setData({ session: { ...row("s1", ["p1", "p2"]), assets: [] }, materials, attached: [{ ...materials[1], fresh: true }] });
  page.cancelEdit();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(plain(puts), [["p1"]]);
  page.onUnload();
});
