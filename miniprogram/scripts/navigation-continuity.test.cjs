const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const model = { id: "video", kind: "video", name: "Video", resolutions: ["720p"], ratios: ["16:9"], modes: ["t2v"], durations: [5] };
const tick = () => new Promise(setImmediate);

test("returning to templates preserves expanded pages and avoids reloading page one", async () => {
  const h = harness(), page = h.page("templates");
  let lists = 0;
  h.api.request = async (path) => {
    if (path === "/config") return { categories: ["推荐"] };
    lists++;
    return { total: 20, items: Array.from({ length: 4 }, (_, i) => ({ id: "t-"+lists+"-"+i, data: { cover: "" } })) };
  };
  await page.load();
  await page.load(true, true);
  page.onHide();
  page.onShow();
  await tick();
  assert.equal(lists, 2);
  assert.equal(page.data.page, 2);
  assert.equal(page.data.items.length, 8);
  assert.equal(page.data.loading, false);
});

test("returning to the editor keeps its draft and controls available during model refresh", async () => {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [model] });
  await page.loadModels();
  page.setData({ prompt: "unchanged draft", hasPrompt: true, quoteText: "预计 2 积分", quoteUnits: 200 });
  page.onHide();
  assert.equal(page.data.quoteText, "预计 2 积分");
  let finish;
  h.api.request = () => new Promise((resolve) => { finish = resolve; });
  page.onShow();
  assert.equal(page.data.modelsLoading, false);
  assert.equal(page.data.prompt, "unchanged draft");
  assert.equal(page.data.quoteText, "预计 2 积分");
  finish({ models: [model] });
  await tick();
  page.onUnload();
});

test("restoring an edit draft requests the model catalogue once", async () => {
  const h = harness(), page = h.page("create");
  let requests = 0;
  h.api.request = async () => { requests++; return { models: [model] }; };
  h.storage.set("edit-draft", { kind: "video", model: "video", prompt: "restored", resolution: "720p", ratio: "16:9", duration: 5, assets: [] });
  page.onShow();
  await tick();
  assert.equal(requests, 1);
  assert.equal(page.data.prompt, "restored");
  page.onUnload();
});

test("hidden editor ignores the previous route's model response", async () => {
  const h = harness(), page = h.page("create");
  let finish;
  h.api.request = () => new Promise((resolve) => { finish = resolve; });
  const pending = page.loadModels();
  page.onHide();
  let patches = 0;
  page.setData = () => patches++;
  finish({ models: [model] });
  await pending;
  assert.equal(patches, 0);
});

test("leaving during template pagination cannot leave cached content stuck behind a spinner", async () => {
  const h = harness(), page = h.page("templates");
  h.api.request = async () => ({ total: 8, items: [{ id: "cached", data: { cover: "" } }] });
  await page.load();
  let finish;
  h.api.request = (path) => path === "/config" ? Promise.resolve({ categories: ["推荐"] }) : new Promise((resolve) => { finish = resolve; });
  const pending = page.load(true, true);
  assert.equal(page.data.loading, true);
  page.onHide();
  page.onShow();
  assert.equal(page.data.loading, false);
  finish({ total: 8, items: [{ id: "stale", data: { cover: "" } }] });
  await pending;
  assert.equal(page.data.items[0].id, "cached");
});

test("a hidden Agent page cannot show a late request-error toast on the next page", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent"), toasts = [];
  page.historyToken = h.api.sessionToken();
  h.wx.showToast = (message) => toasts.push(message);
  let reject;
  h.api.request = () => new Promise((_, fail) => { reject = fail; });
  h.wx.request = (options) => h.api.request().then(
    (data) => options.success({ statusCode: 200, data }),
    (reason) => options.fail(reason),
  );
  const pending = page.load();
  await tick();
  page.onHide();
  reject(new Error("old request failed"));
  await pending;
  assert.equal(toasts.length, 0);
  assert.equal(page.failed, false);
});
