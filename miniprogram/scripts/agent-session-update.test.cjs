const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// Sending a message moves the project's version on the server; a material
// change made with the page's older copy is applied again, not refused.
test("a project change after a message retries with the fresh version", async () => {
  const h = harness();
  await h.api.signIn();
  const puts = [];
  h.wx.request = (o) => {
    const path = o.url.split("/api")[1];
    const ok = (data, statusCode = 200) => queueMicrotask(() => o.success({ statusCode, data }));
    if (path === "/agent/sessions/s1" && o.method === "PUT") {
      puts.push(o.data.version);
      return o.data.version === 2 ? ok({ id: "s1", version: 3, data: { assets: o.data.assets } }) : ok({ error: "数据已发生变化，请刷新后重试" }, 409);
    }
    if (path === "/agent/sessions/s1") return ok({ id: "s1", version: 2, data: {}, assets: [] });
    return ok({});
  };
  const { updateSession } = h.service("../services/agent");
  const row = await updateSession("s1", 1, { assets: ["v1"] });
  assert.deepEqual(puts, [1, 2]);
  assert.equal(row.version, 3);
});

test("other failures are not retried", async () => {
  const h = harness();
  await h.api.signIn();
  let puts = 0;
  h.wx.request = (o) => {
    puts++;
    queueMicrotask(() => o.success({ statusCode: 400, data: { error: "最多 9 个素材" } }));
  };
  const { updateSession } = h.service("../services/agent");
  await assert.rejects(updateSession("s1", 1, { assets: [] }), /最多 9 个素材/);
  assert.equal(puts, 1);
});
