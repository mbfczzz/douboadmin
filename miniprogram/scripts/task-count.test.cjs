const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const makePage = () => ({ visible: true, destroyed: false, data: { runningTasks: 0 }, setData(value) { Object.assign(this.data, value); } });

test("guests do not request a task count or open a login flow", () => {
  const h = harness(), page = makePage();
  let requests = 0;
  h.wx.request = () => { requests++; };
  h.service("../pages/create/task-count").startTaskCount(page);
  assert.equal(requests, 0);
  assert.equal(page.data.runningTasks, 0);
  assert.equal(h.loginCount(), 0);
});

test("the counter uses total, polls without overlap, updates to zero and stops on hide", async () => {
  const timers = [], cleared = [];
  const h = harness({ setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: (id) => cleared.push(id) });
  await h.api.signIn();
  const counter = h.service("../pages/create/task-count"), page = makePage(), requests = [];
  let aborted = 0;
  h.wx.request = (request) => { requests.push(request); return { abort() { aborted++; } }; };
  counter.startTaskCount(page);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /size=1&status=running&excludeChat=true&excludeImport=true/);
  assert.equal(requests[0].header.Authorization, "Bearer " + h.api.sessionToken());
  assert.equal(timers.filter((t) => t.delay === 5000).length, 0);
  requests[0].success({ statusCode: 200, data: { total: 27, items: [{}] } });
  requests[0].complete();
  assert.equal(page.data.runningTasks, 27);
  timers.at(-1).fn();
  assert.equal(requests.length, 2);
  requests[1].success({ statusCode: 200, data: { total: 0, items: [] } });
  requests[1].complete();
  assert.equal(page.data.runningTasks, 0);
  timers.at(-1).fn();
  page.visible = false;
  counter.stopTaskCount(page);
  assert.equal(aborted, 1);
  requests[2].success({ statusCode: 200, data: { total: 8 } });
  requests[2].complete();
  assert.equal(page.data.runningTasks, 0);
  const count = requests.length;
  timers.at(-1).fn();
  assert.equal(requests.length, count);
});

test("late responses cannot overwrite a resumed page and authentication failure is silent", async () => {
  const h = harness({ setTimeout: () => 1, clearTimeout() {} });
  await h.api.signIn();
  const counter = h.service("../pages/create/task-count"), page = makePage(), requests = [];
  let toasts = 0;
  h.wx.showToast = () => toasts++;
  h.wx.request = (request) => { requests.push(request); return { abort() {} }; };
  counter.startTaskCount(page);
  counter.stopTaskCount(page);
  counter.startTaskCount(page);
  requests[1].success({ statusCode: 200, data: { total: 2 } });
  requests[0].success({ statusCode: 200, data: { total: 99 } });
  requests[0].complete();
  assert.equal(page.data.runningTasks, 2);
  requests[1].success({ statusCode: 401, data: {} });
  requests[1].complete();
  assert.equal(page.data.runningTasks, 0);
  assert.equal(toasts, 0);
  assert.equal(h.nav.length, 0);
});

test("an account change discards an in-flight response and clears the previous count", async () => {
  const h = harness({ setTimeout: () => 1, clearTimeout() {} });
  await h.api.signIn();
  const counter = h.service("../pages/create/task-count"), page = makePage();
  let pending;
  h.wx.request = (request) => { pending = request; return { abort() {} }; };
  counter.startTaskCount(page);
  page.data.runningTasks = 4;
  h.wx.request = (request) => request.success({ statusCode: 200, data: {} });
  await h.api.logout();
  pending.success({ statusCode: 200, data: { total: 9 } });
  pending.complete();
  assert.equal(page.data.runningTasks, 0);
});
