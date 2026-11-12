const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const profile = (name = "用户") => ({
  profile: { data: { nickname: name } }, works: 1, running: 0, favorites: 2,
});
const finished = (id) => ({
  id, status: "succeeded", createdAt: "2026-11-12",
  input: { kind: "image", prompt: id, assets: [] },
});
const pageOf = (id) => ({ items: [finished(id)], total: 1, page: 1, size: 2 });

test("slow recent works never hold the account page behind its loading screen", async () => {
  const h = harness();
  await h.api.signIn();
  h.api.request = async () => profile();
  let recent;
  h.wx.request = (options) => { recent = options; };
  const page = h.page("mine"), loading = page.load();
  await new Promise(setImmediate);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.me.favorites, 2);
  assert.equal(page.data.worksLoading, true);
  recent.fail({ errMsg: "timeout" });
  await loading;
  assert.equal(page.data.worksLoading, false);
  assert.ok(page.data.worksError);
  assert.equal(page.data.me.works, 1);
  page.onUnload();
});

test("cancelled account requests leave a retryable state instead of a permanent spinner", async () => {
  const h = harness();
  await h.api.signIn();
  h.api.request = async () => { throw new h.api.AuthCancelledError(); };
  h.wx.request = (o) => o.success({ statusCode: 200, data: pageOf("done") });
  const page = h.page("mine");
  await page.load();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.worksLoading, false);
  assert.match(page.data.loadError, /重试/);
  h.api.request = async () => profile();
  await page.load();
  assert.equal(page.data.loadError, "");
  assert.equal(page.data.me.works, 1);
  page.onUnload();
});

test("late previews from a previous account cannot replace the current account", async () => {
  const h = harness();
  await h.api.signIn();
  let name = "前账号";
  h.api.request = async () => profile(name);
  const pending = [];
  h.wx.request = (options) => pending.push(options);
  const page = h.page("mine"), first = page.load();
  await new Promise(setImmediate);
  page.onHide();
  const session = h.storage.get("douboSession");
  h.storage.set("douboSession", { ...session, userId: "new-user", token: "new-token" });
  page.visible = true;
  name = "新账号";
  const second = page.load();
  await new Promise(setImmediate);
  pending[1].success({ statusCode: 200, data: pageOf("new-work") });
  await second;
  pending[0].success({ statusCode: 200, data: pageOf("old-work") });
  await first;
  assert.equal(page.data.me.profile.data.nickname, "新账号");
  assert.equal(page.data.jobs[0].id, "new-work");
  assert.equal(page.data.worksError, "");
  page.onUnload();
});
