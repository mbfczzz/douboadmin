const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

function observe(h) {
  const listeners = new Set();
  h.wx.onAppRouteDone = (fn) => listeners.add(fn);
  h.wx.offAppRouteDone = (fn) => listeners.delete(fn);
  return {
    listeners,
    emit: (openType, path) =>
      [...listeners].forEach((fn) => fn({ openType, path })),
  };
}

test("login resumes the original action only after the correct return animation", async () => {
  const h = harness(),
    route = observe(h);
  h.pages.push({ route: "pages/create/index" }, { route: "pages/login/index" });
  let resumed = false;
  const pending = h.api.login().then(() => {
    resumed = true;
  });
  await h.api.signIn();
  h.wx.navigateBack = ({ success }) => success({});
  const page = h.page("login");
  const finishing = page.finish();
  await Promise.resolve();
  assert.equal(resumed, false);
  assert.equal(page.data.returning, true);
  route.emit("navigateTo", "pages/create/index");
  route.emit("navigateBack", "pages/mine/index");
  await Promise.resolve();
  assert.equal(resumed, false);
  route.emit("navigateBack", "pages/create/index");
  await finishing;
  await pending;
  assert.equal(resumed, true);
  assert.equal(route.listeners.size, 0);
});

test("direct-entry login falls back to Mine and waits for its transition", async () => {
  const h = harness(),
    route = observe(h);
  h.wx.navigateBack = ({ fail }) => fail({ errMsg: "no previous page" });
  let target;
  let reached;
  const switched = new Promise((resolve) => {
    reached = resolve;
  });
  h.wx.switchTab = ({ url, success }) => {
    target = url;
    success({});
    reached();
  };
  let finished = false;
  const pending = h.api.returnAfterTransition("/pages/mine/index").then(() => {
    finished = true;
  });
  await switched;
  assert.equal(target, "/pages/mine/index");
  assert.equal(finished, false);
  route.emit("switchTab", "pages/mine/index");
  await pending;
  assert.equal(route.listeners.size, 0);
});

test("failed return cleans listeners and rejects pending login without clearing identity", async () => {
  const h = harness(),
    route = observe(h);
  const rejected = assert.rejects(h.api.login(), /取消登录/);
  await h.api.signIn();
  h.wx.navigateBack = ({ fail }) => fail({});
  h.wx.switchTab = ({ fail }) => fail({});
  const page = h.page("login");
  await page.finish();
  await rejected;
  assert.equal(route.listeners.size, 0);
  assert.equal(h.api.hasSession(), true);
  assert.equal(page.completed, false);
  assert.equal(page.data.returning, false);
});

test("return remains usable on clients without route animation events", async () => {
  const h = harness();
  h.wx.navigateBack = ({ success }) => success({});
  await h.api.returnAfterTransition("/pages/mine/index");
});

test("returning to templates preserves rendered items during paged refresh", async () => {
  const h = harness(),
    page = h.page("templates");
  const rows = Array.from({ length: 7 }, (_, i) => ({
    id: String(i),
    data: { cover: "/media/test.jpg" },
  }));
  h.api.request = async () => rows;
  await page.load();
  page.more();
  let complete;
  h.api.request = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const refresh = page.load(true);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.columns.flatMap((c) => c.items).length + (page.data.hero ? 1 : 0), 7);
  complete(rows);
  await refresh;
  assert.equal(page.data.columns.flatMap((c) => c.items).length + (page.data.hero ? 1 : 0), 7);
  assert.equal(page.data.visibleCount, 7);
  h.api.request = async () => {
    throw new Error("offline");
  };
  await page.load(true);
  assert.equal(page.data.loadError, "");
  assert.equal(page.data.columns.flatMap((c) => c.items).length + (page.data.hero ? 1 : 0), 7);
});

test("route changes and foregrounding keep page content fully visible without restarting an animation", () => {
  const h = harness(),
    page = h.page("create");
  page.setData({ prompt: "keep this input" });
  h.api.enterPage(page);
  const first = page.data.pageMotion;
  h.api.enterPage(page);
  assert.equal(page.data.pageMotion, first);
  h.api.enterPage(h.page("templates"));
  h.api.enterPage(page);
  assert.equal(page.data.pageMotion, first);
  assert.equal(page.data.prompt, "keep this input");
});

test("tab switching ignores repeated taps and unlocks after failure", () => {
  const h = harness(),
    bar = h.component("custom-tab-bar");
  const calls = [];
  h.wx.switchTab = (options) => calls.push(options);
  const tap = (index) =>
    bar.switchTab({ currentTarget: { dataset: { index } } });
  tap(0);
  assert.equal(calls.length, 0);
  tap(2);
  tap(2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/pages/create/index");
  calls[0].fail();
  calls[0].complete();
  tap(2);
  assert.equal(calls.length, 2);
  calls[1].complete();
  bar.pageLifetimes.show.call(bar);
  assert.equal(bar.data.switching, false);
  tap(1);
  assert.equal(calls.length, 3);
});
