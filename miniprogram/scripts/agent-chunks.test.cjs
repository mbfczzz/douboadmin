const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// Replies read as a stream: bytes arrive in arbitrary pieces.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bytes = (s) => new Uint8Array(Buffer.from(s, "utf8")).buffer;
const job = (status, result = "") => ({ id: "c1", status, result, createdAt: new Date().toISOString(), input: { kind: "chat", prompt: "做探店", sessionId: "s1" } });
const session = { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] };

test("characters split across pieces are decoded whole", () => {
  const { utf8Pieces } = harness().service("../utils/utf8");
  const decode = utf8Pieces();
  const all = Buffer.from("镜头1：推门 🎬 ok", "utf8");
  let out = "";
  for (let i = 0; i < all.length; i += 2) out += decode(all.subarray(i, i + 2).buffer.slice(all.byteOffset + i, all.byteOffset + Math.min(i + 2, all.length)));
  assert.equal(out, "镜头1：推门 🎬 ok");
});

function streaming(h, status) {
  let task;
  h.wx.canIUse = () => true;
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data) => queueMicrotask(() => o.success({ statusCode: 200, data }));
    if (path === "/jobs/c1/stream") {
      task = { listeners: [], onChunkReceived(f) { this.listeners.push(f); }, abort() { this.aborted = true; }, push(s) { this.listeners.forEach((f) => f({ data: bytes(s) })); }, o };
      return task;
    }
    if (path === "/jobs/c1/stop") return (status.stopped = true), ok({ status: "running" });
    if (path.startsWith("/jobs?")) return ok({ items: [job(status.value, status.value === "succeeded" ? "好的，开场先推门" : "")], total: 1 });
    return ok({ models: [] });
  };
  return () => task;
}

test("a streamed reply grows with each event and ends with the whole reply", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const status = { value: "running" };
  const task = streaming(h, status);
  page.setData({ session });
  await page.load(true);
  assert.ok(task(), "the reply is read as a stream");
  const first = 'data: {"text":"好的，开' + '场"}\n\n';
  const raw = Buffer.from(first + 'data: {"delta":"先推门"}\n\n', "utf8");
  // byte 20 falls inside 的 (3 bytes): held until the rest arrives
  task().listeners.forEach((f) => f({ data: raw.buffer.slice(raw.byteOffset, raw.byteOffset + 20) }));
  task().listeners.forEach((f) => f({ data: raw.buffer.slice(raw.byteOffset + 20, raw.byteOffset + raw.length) }));
  const seen = new Set();
  for (let i = 0; i < 40 && page.data.messages[1].text !== "好的，开场先推门"; i++) await wait(20), seen.add(page.data.messages[1].text);
  assert.equal(page.data.messages[1].text, "好的，开场先推门");
  assert.ok(seen.size > 2, "typed out in steps, not all at once");
  assert.equal(page.data.messages[1].streaming, true);
  assert.equal(page.data.replying, true);
  status.value = "succeeded";
  task().push('data: {"done":true,"status":"succeeded"}\n\n');
  for (let i = 0; i < 40 && page.data.messages[1].pending; i++) await wait(20);
  assert.equal(page.data.messages[1].streaming, undefined);
  assert.equal(page.data.replying, false);
  page.onUnload();
});

test("停止回复 asks the server to stop the reply being written", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  const status = { value: "running" };
  const task = streaming(h, status);
  page.setData({ session });
  await page.load(true);
  assert.equal(page.data.replying, true); // the send button is a stop button
  await page.stopReply();
  assert.equal(status.stopped, true);
  page.onHide();
  assert.equal(task().aborted, true); // leaving closes the stream
});
