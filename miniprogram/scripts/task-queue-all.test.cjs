const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const job = (id, status, extra = {}) => ({ id, status, createdAt: new Date().toISOString(), result: "", thumbnailUrl: "",
  input: { kind: "video", prompt: "", model: "m", assets: [], ...extra.input }, ...extra });

test("the queue lists every status, counts finished work, and titles template jobs", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("tasks");
  const items = [
    job("run", "running"), job("bad", "failed", { error: "x" }),
    job("ok", "succeeded", { thumbnailUrl: "https://cdn.test/ok.jpg", templateTitle: "W01 社区日常综合宣传", input: { templateId: "t" } }),
    job("mine", "succeeded", { input: { prompt: "海边日落" } }),
  ];
  h.wx.request = (o) => o.success({ statusCode: 200, data: new URL(o.url).pathname.endsWith("/jobs") ? { page: 1, size: 20, total: 4, items } : {} });
  await page.load();
  assert.deepEqual(Array.from(page.data.jobs, (j) => [j.id, j.group]), [["run", "running"], ["bad", "failed"], ["ok", "done"], ["mine", "done"]]);
  assert.deepEqual([page.data.runningCount, page.data.failedCount, page.data.doneCount], [1, 1, 2]);
  const ok = page.data.jobs[2];
  assert.equal(ok.shortTitle, "W01 社区日常综合宣传");
  assert.equal(ok.cover, "https://cdn.test/ok.jpg");
  assert.equal(page.data.jobs[3].shortTitle, "海边日落");
  page.pick({ currentTarget: { dataset: { filter: "done" } } });
  assert.equal(page.data.filter, "done");
});
