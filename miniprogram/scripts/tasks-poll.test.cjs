const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// 任务队列 polls every 3 s and each reply re-signs the pictures. A cover the
// user already sees keeps its address, or every thumbnail would reload and blink.
test("polling keeps each cover's address while it is the same picture", async () => {
  const h = harness();
  await h.api.signIn();
  let sig = 0;
  const job = (id, status) => ({ id, status, createdAt: new Date().toISOString(), input: { kind: "video", assets: [], prompt: "p" }, thumbnailUrl: status === "succeeded" ? `https://oss.test/thumb/${id}.jpg?x-oss-signature=s${sig}` : "" });
  h.service("job-pages").jobPage = async () => { sig++; return { items: [job("live", "running"), job("done", "succeeded")], total: 2 }; };
  const page = h.page("tasks");
  await page.load();
  const first = page.data.jobs.find((j) => j.id === "done").cover;
  assert.match(first, /x-oss-signature=s1$/);
  await page.load();
  assert.equal(page.data.jobs.find((j) => j.id === "done").cover, first);
  page.onUnload();
});
