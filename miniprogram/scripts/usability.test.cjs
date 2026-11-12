const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const makeJob = (id, kind, status = "succeeded") => ({
  id,
  status,
  createdAt: "2026-10-31T10:00:00Z",
  result: "/media/result",
  input: {
    kind,
    model: "demo-" + kind,
    prompt: id,
    assets: [],
    ratio: "1:1",
    resolution: "1K",
    duration: 0,
  },
});

test("generation and upload login explain the pending action without putting user content in the URL", async () => {
  const h = harness();
  const pending = h.api.request("/jobs", "POST", {
    kind: "video",
    prompt: "private text",
  });
  const rejected = assert.rejects(pending, /取消登录/);
  assert.match(h.nav[0].url, /purpose=generate/);
  assert.ok(!h.nav[0].url.includes("private"));
  h.api.cancelLogin();
  await rejected;
  const upload = h.api.upload("private-photo.jpg");
  const cancelled = assert.rejects(upload, /取消登录/);
  assert.match(h.nav[1].url, /purpose=upload/);
  h.api.cancelLogin();
  await cancelled;
});

test("login shows contextual copy and handles unknown context safely", async () => {
  const h = harness(),
    page = h.page("login");
  h.api.request = async () => ({ wechatLogin: true, demoLogin: false });
  page.onLoad({ purpose: "generate" });
  await new Promise(setImmediate);
  assert.equal(page.data.heading, "登录后继续生成");
  assert.match(page.data.description, /已保留/);
  assert.equal(page.data.backLabel, "返回继续编辑");
  const other = harness(),
    unknown = other.page("login");
  other.api.request = async () => ({});
  unknown.onLoad({ purpose: "constructor" });
  await new Promise(setImmediate);
  assert.equal(unknown.data.heading, "你的创作空间");
});

test("all works opens a completed-work library instead of the task queue", () => {
  const h = harness();
  h.page("mine").menu({ currentTarget: { dataset: { mode: "works" } } });
  assert.equal(h.nav[0].url, "/pages/works/index");
});

test("work filters contain only completed media and treat mixes as videos", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("works");
  h.api.request = async () => [
    makeJob("image", "image"),
    makeJob("video", "video"),
    makeJob("mix", "mix"),
    makeJob("pending", "video", "running"),
    makeJob("failed", "image", "failed"),
    makeJob("chat", "chat"),
  ];
  h.wx.request = async o => { try { o.success({statusCode:200,data:await h.api.request(o.url.split("/api")[1])}); } catch {o.fail({errMsg:"offline"});} };
  await page.load();
  assert.equal(page.data.filtered.length, 3);
  page.choose({ currentTarget: { dataset: { value: "image" } } });
  await new Promise(setImmediate);
  assert.equal(page.data.filtered[0].id, "image");
  assert.equal(page.data.filtered.length, 1);
  page.choose({ currentTarget: { dataset: { value: "video" } } });
  await new Promise(setImmediate);
  assert.deepEqual(
    Array.from(page.data.filtered, (j) => j.id),
    ["video", "mix"],
  );
  h.api.request = async () => {
    throw new Error("offline");
  };
  await page.load();
  assert.equal(page.data.filtered.length, 2);
  assert.ok(page.data.loadError);
});

test("a guest can browse back from the work-library login without an automatic login loop", async () => {
  const h = harness(),
    page = h.page("works");
  await page.load();
  assert.equal(page.data.needsLogin, true);
  assert.equal(h.nav.length, 0);
  const pending = page.signIn();
  assert.match(h.nav[0].url, /purpose=works/);
  h.api.cancelLogin();
  await pending;
  await page.load();
  assert.equal(h.nav.length, 1);
  assert.equal(page.data.signingIn, false);
});

test("removed example action cannot replace the user's prompt", () => {
  const h = harness(),
    page = h.page("create");
  assert.equal(page.useExample, undefined);
  page.input({ detail: { value: "我的描述" } });
  assert.equal(page.data.prompt, "我的描述");
  assert.equal(h.sent.length, 0);
});

test("pending works point to task progress while finished works remain in the library", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("mine");
  h.api.request = async (p) =>
    p.startsWith("/jobs")
      ? [makeJob("pending", "image", "running")]
      : {
          profile: { version: 1, data: { nickname: "小豆", bio: "" } },
          works: 0,
          running: 1,
          favorites: 0,
        };
  h.wx.request = async o => o.success({statusCode:200,data:await h.api.request(o.url.split("/api")[1])});
  await page.load();
  assert.equal(page.data.me.running, 1);
  page.menu({ currentTarget: { dataset: { mode: "tasks" } } });
  assert.equal(h.nav[0].url, "/pages/tasks/index");
  page.onUnload();
});
