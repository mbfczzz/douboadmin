const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("session expiry clears private data in the new business pages", async () => {
  for (const [name, field, previous] of [
    ["wallet", "info", { wallet: { availableUnits: 100 } }],
    ["orders", "rows", [{ id: "private-order" }]],
    ["notifications", "items", [{ id: "private-notice" }]],
    ["preferences", "row", { version: 1, data: { analytics: true } }],
  ]) {
    const h = harness(),
      page = h.page(name);
    let authenticated = true;
    h.api.hasSession = () => authenticated;
    h.api.request = async () => {
      authenticated = false;
      throw Error("登录已过期");
    };
    page.setData({ [field]: previous });
    await page.load();
    assert.equal(page.data.needsLogin, true, name);
    assert.ok(page.data[field] === null || page.data[field].length === 0, name);
  }
});

test("a notification response cannot navigate after leaving its page", async () => {
  const h = harness(),
    page = h.page("notifications");
  let finish,
    calls = 0;
  page.setData({
    items: [{ id: "notice", data: { kind: "job", targetId: "task" } }],
  });
  h.api.request = () => {
    calls++;
    return new Promise((resolve) => (finish = resolve));
  };
  const event = { currentTarget: { dataset: { id: "notice" } } };
  const opened = page.open(event);
  await page.open(event);
  assert.equal(calls, 1);
  page.onHide();
  finish({});
  await opened;
  assert.equal(h.nav.length, 0);
});

test("clearing search history prevents an older history request from restoring it", async () => {
  const h = harness(),
    page = h.page("hot-videos");
  let finish;
  h.api.hasSession = () => true;
  h.api.request = async (path, method) =>
    path === "/hot/discovery"
      ? { enabled: true, keywords: [], source: "推荐" }
      : method === "DELETE"
        ? {}
        : new Promise((resolve) => (finish = resolve));
  const discovery = page.discovery();
  await new Promise(setImmediate);
  await page.clearHistory();
  finish([{ keyword: "old search" }]);
  await discovery;
  assert.equal(page.data.history.length, 0);
});

test("late preferences do not restore analytics consent after logout", async () => {
  const h = harness(),
    page = h.page("preferences");
  let finish;
  page.setData({ row: { version: 1, data: { analytics: false } } });
  h.wx.reLaunch = () => {};
  h.api.logout = async () => {};
  h.api.request = () => new Promise((resolve) => (finish = resolve));
  const change = page.change({
    currentTarget: { dataset: { field: "analytics" } },
    detail: { value: true },
  });
  await page.signOut();
  finish({ version: 2, data: { analytics: true } });
  await change;
  assert.equal(h.storage.has("analytics-consent"), false);
});

test("an order refresh after unload does not start another request or update UI", async () => {
  const h = harness(),
    page = h.page("orders");
  let finish,
    calls = 0;
  h.api.request = () => {
    calls++;
    return new Promise((resolve) => (finish = resolve));
  };
  const task = page.refresh({ currentTarget: { dataset: { id: "order" } } });
  page.onUnload();
  page.setData = () => assert.fail("write after unload");
  finish({});
  await task;
  assert.equal(calls, 1);
});

test("an invalidated public share clears the previously displayed work", async () => {
  const h = harness(),
    page = h.page("shared-work");
  page.setData({ work: { title: "old", result: "old-result" } });
  h.api.request = async () => {
    throw Error("分享已失效");
  };
  await page.load();
  assert.equal(page.data.work, null);
  assert.match(page.data.loadError, /已失效/);
});
