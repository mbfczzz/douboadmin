const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const row = (id) => ({ id, data: { cover: "/media/example.jpg" } });

test("a changed category cannot reuse previous-category content during reentry", async () => {
  const h = harness(),
    page = h.page("templates");
  h.api.request = async () => [row("old-category")];
  await page.load();
  const responses = [];
  h.api.request = () => new Promise((resolve) => responses.push(resolve));
  page.setData({ category: "旅行" });
  const first = page.load();
  const second = page.load(true);
  assert.equal(page.data.loading, true);
  responses[1]([row("latest-trip")]);
  await second;
  responses[0]([row("stale-trip")]);
  await first;
  assert.equal(page.data.items[0].id, "latest-trip");
  assert.equal(page.data.loading, false);
});

test("an empty category stays stable on return and an unloaded page ignores responses", async () => {
  const h = harness(),
    page = h.page("templates");
  h.api.request = async () => [];
  await page.load();
  let resolve;
  h.api.request = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = page.load(true);
  assert.equal(page.data.loading, false);
  page.onUnload();
  let updates = 0;
  page.setData = () => {
    updates++;
  };
  resolve([row("too-late")]);
  await pending;
  assert.equal(updates, 0);
});

test("forward navigation blocks duplicate pushes, preserves callbacks, and unlocks on return or error", () => {
  const h = harness(),
    page = h.page("templates");
  h.api.enterPage(page);
  let channel;
  h.api.openPage(page, {
    url: "/pages/upload-preview/index",
    success: (r) => {
      channel = r.eventChannel;
    },
  });
  h.api.openPage(page, { url: "/pages/upload-preview/index" });
  assert.equal(h.nav.length, 1);
  const eventChannel = { emit() {} };
  h.nav[0].success({ eventChannel });
  assert.equal(channel, eventChannel);
  h.api.enterPage(page);
  h.api.openPage(page, { url: "/pages/tasks/index" });
  assert.equal(h.nav.length, 2);
  h.nav[1].fail({ errMsg: "failed" });
  h.api.openPage(page, { url: "/pages/tasks/index" });
  assert.equal(h.nav.length, 3);
});

test("the header prevents double back and unlocks if both back and fallback fail", () => {
  const h = harness(),
    header = h.component("components/nav-bar");
  const backs = [],
    fallbacks = [];
  h.wx.navigateBack = (o) => backs.push(o);
  h.wx.switchTab = (o) => fallbacks.push(o);
  header.goBack();
  header.goBack();
  assert.equal(backs.length, 1);
  backs[0].fail();
  fallbacks[0].fail();
  header.goBack();
  assert.equal(backs.length, 2);
  header.setData({ disabled: true, backing: false });
  header.goBack();
  assert.equal(backs.length, 2);
});

test("a late login completion cannot resolve or cancel a newer login flow", async () => {
  const h = harness();
  const old = assert.rejects(h.api.login(), /取消登录/);
  const checkpoint = h.api.captureLoginFlow();
  h.api.cancelLogin();
  await old;
  let resumed = false;
  const current = h.api.login().then(() => {
    resumed = true;
  });
  await h.api.signIn();
  checkpoint.complete();
  checkpoint.cancel();
  await Promise.resolve();
  assert.equal(resumed, false);
  h.api.completeLogin();
  await current;
  assert.equal(resumed, true);
});

test("an already authenticated login page waits for entry to finish before returning", async () => {
  const h = harness();
  await h.api.signIn();
  const listeners = new Set();
  h.wx.onAppRouteDone = (fn) => listeners.add(fn);
  h.wx.offAppRouteDone = (fn) => listeners.delete(fn);
  let calls = 0;
  h.wx.navigateBack = ({ success }) => {
    calls++;
    success({});
    [...listeners].forEach((fn) =>
      fn({ openType: "navigateBack", path: "pages/mine/index" }),
    );
  };
  const page = h.page("login");
  page.onLoad();
  page.onReady();
  assert.equal(calls, 0);
  assert.equal(page.data.returning, true);
  page.onRouteDone();
  assert.equal(calls, 1);
  page.onRouteDone();
  assert.equal(calls, 1);
  await new Promise(setImmediate);
  assert.equal(listeners.size, 0);
  page.onUnload();
});

test("unloading an authenticated login page cancels its pending automatic return", async () => {
  const h = harness();
  await h.api.signIn();
  let navigations = 0;
  h.wx.navigateBack = () => {
    navigations++;
  };
  const page = h.page("login");
  page.onLoad();
  page.onReady();
  page.onUnload();
  page.onRouteDone();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(navigations, 0);
});
