const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// A reply being written is read every 0.5 s and shown as it grows; when it
// ends the whole reply (and its plan card) replaces it.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const job = (status, result) => ({ id: "c1", status, result, createdAt: new Date().toISOString(), input: { kind: "chat", prompt: "做探店", sessionId: "s1" } });

test("a reply streams in, follows the reader down, then becomes the final reply", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const replies = ["", "好的，开场", "好的，开场先推门\n```plan\n{\"kind\""];
  let status = "running";
  let reads = 0;
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => o.success({ statusCode: 200, data });
    if (path === "/jobs/c1/reply") return ok({ status, text: replies[Math.min(reads++, replies.length - 1)] });
    if (path.startsWith("/jobs?")) return ok({ items: [job(status, status === "succeeded" ? "好的，开场先推门" : "")], total: 1 });
    return ok({ models: [] });
  };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] } });
  await page.load(true);
  assert.equal(page.data.messages[1].text.startsWith("正在构思"), true); // nothing written yet
  for (let i = 0; i < 40 && page.data.messages[1].text !== "好的，开场"; i++) await wait(50);
  assert.equal(page.data.messages[1].streaming, true);
  assert.equal(page.data.bottom.startsWith("end-"), true); // kept in view
  page.chatScroll({ detail: { deltaY: 20 } }); // the reader scrolls up: stop following
  const before = page.data.bottom;
  for (let i = 0; i < 40 && !page.data.messages[1].planning; i++) await wait(50);
  assert.equal(page.data.messages[1].text, "好的，开场先推门");
  assert.equal(page.data.bottom, before);
  status = "succeeded";
  for (let i = 0; i < 40 && page.data.messages[1].pending; i++) await wait(50);
  assert.equal(page.data.messages[1].streaming, undefined);
  assert.equal(page.data.messages[1].text, "好的，开场先推门");
  assert.equal(page.streamId, "");
  page.onUnload();
});

test("leaving the page stops reading the reply", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  let reads = 0;
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => o.success({ statusCode: 200, data });
    if (path === "/jobs/c1/reply") return reads++, ok({ status: "running", text: "写" });
    if (path.startsWith("/jobs?")) return ok({ items: [job("running", "")], total: 1 });
    return ok({ models: [] });
  };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] } });
  await page.load(true);
  await wait(50);
  page.onHide();
  const seen = reads;
  await wait(1200);
  assert.equal(reads, seen);
});

test("a new message waits for the reply being written, unless it is stuck", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const posts = [];
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  h.wx.request = (o) => {
    const ok = (data) => o.success({ statusCode: 200, data });
    if (o.method === "POST") posts.push(o.url);
    return ok({ models: [] });
  };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] }, prompt: "再改改" });
  page.history = [job("running", "")];
  await page.send();
  assert.equal(posts.length, 0);
  assert.match(toasts.join(), /上一条还在回复/);
  // A long plan may take minutes: still waited for at three minutes...
  page.history = [{ ...job("running", ""), createdAt: new Date(Date.now() - 180000).toISOString() }];
  toasts.length = 0;
  await page.send();
  assert.match(toasts.join(), /上一条还在回复/);
  // ...but not when stuck for over ten.
  page.history = [{ ...job("running", ""), createdAt: new Date(Date.now() - 660000).toISOString() }];
  toasts.length = 0;
  await page.send();
  assert.doesNotMatch(toasts.join(), /上一条还在回复/);
  page.onUnload();
});
