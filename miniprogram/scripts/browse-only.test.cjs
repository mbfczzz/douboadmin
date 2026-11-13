const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const preview = {
  active: false,
  canBrowse: true,
  status: "review",
  message: "已登记，等待总部开通",
};
const denial = {
  statusCode: 403,
  data: {
    code: "ACTIVATION_REQUIRED",
    error: preview.message,
    access: preview,
  },
};

test("pending users can choose browsing while the approval page remains available", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("activate"),
    moves = [];
  h.wx.reLaunch = (o) => moves.push(o.url);
  h.wx.request = (o) => o.success({ statusCode: 200, data: preview });
  await page.load();
  assert.equal(page.data.status.canBrowse, true);
  assert.equal(page.data.status.active, false);
  assert.equal(moves.length, 0);
  page.enter();
  assert.deepEqual(moves, ["/pages/templates/index"]);
});

test("a newly scanned pending identity receives its browse permission immediately", async () => {
  const h = harness(),
    page = h.page("activate");
  await h.api.signIn();
  page.owner = h.api.sessionUserId();
  page.setData({ logged: true });
  h.api.request = async () => preview;
  await page.join("KMNP2345", "scan");
  assert.equal(page.data.status.canBrowse, true);
  assert.equal(page.data.status.active, false);
});

for (const status of [
  preview,
  { active: true, canBrowse: true, status: "active" },
]) {
  test(`${status.status} users remain in the mini-program on resume`, async () => {
    const h = harness();
    await h.api.signIn();
    const moves = [];
    h.wx.reLaunch = (o) => moves.push(o.url);
    h.wx.request = (o) => o.success({ statusCode: 200, data: status });
    await h.service("access").enforceAccess("pages/create/index");
    assert.deepEqual(moves, []);
  });
}

for (const status of [
  { active: false, canBrowse: false, status: "pending" },
  { active: false, canBrowse: false, status: "disabled" },
  { active: false, status: "review" },
]) {
  test(`${status.status} without explicit browse permission still returns to activation`, async () => {
    const h = harness();
    await h.api.signIn();
    const moves = [];
    h.wx.reLaunch = (o) => moves.push(o.url);
    h.wx.request = (o) => o.success({ statusCode: 200, data: status });
    await h.service("access").enforceAccess("pages/create/index");
    assert.deepEqual(moves, ["/pages/activate/index"]);
  });
}

test("login can return a pending browser to the requested page", async () => {
  const h = harness();
  await h.api.signIn();
  h.storage.set("activation-required", true);
  const page = h.page("login"),
    moves = [],
    returns = [];
  h.wx.reLaunch = (o) => moves.push(o.url);
  h.wx.request = (o) => o.success({ statusCode: 200, data: preview });
  h.api.returnAfterTransition = async (url) => returns.push(url);
  await page.finish();
  assert.equal(page.completed, true);
  assert.deepEqual(moves, []);
  assert.deepEqual(returns, ["/pages/mine/index"]);
});

for (const mode of ["request", "upload"]) {
  test(`pending ${mode} denial stays on the current page with a readable message`, async () => {
    const h = harness();
    await h.api.signIn();
    const moves = [];
    h.wx.reLaunch = (o) => moves.push(o.url);
    h.wx.request = (o) => o.success(denial);
    h.wx.uploadFile = (o) =>
      o.success({ ...denial, data: JSON.stringify(denial.data) });
    const action =
      mode === "request"
        ? h.api.request("/jobs", "POST", {})
        : h.api.upload("test.jpg");
    await assert.rejects(
      action,
      (e) =>
        e instanceof h.api.RequestError &&
        e.status === 403 &&
        e.message.includes("等待总部开通"),
    );
    assert.deepEqual(moves, []);
    assert.equal(h.api.hasSession(), true);
  });
}

test("generation stops before confirmation while pending and works after approval", async () => {
  const h = harness();
  await h.api.signIn();
  let active = false,
    modals = 0;
  const calls = [];
  h.wx.showModal = async () => {
    modals++;
    return { confirm: true };
  };
  h.wx.request = (o) => {
    const path = new URL(o.url).pathname;
    calls.push(path);
    o.success(
      !active
        ? denial
        : {
            statusCode: 200,
            data: path.endsWith("/quote")
              ? { units: 0, billingEnabled: false }
              : { id: "approved-job", status: "queued" },
          },
    );
  };
  const input = { kind: "image", model: "model", prompt: "test" };
  await assert.rejects(h.api.submitInput(input, "preview"), /等待总部开通/);
  assert.equal(modals, 0);
  assert.deepEqual(calls, ["/api/jobs/quote"]);
  active = true;
  const job = await h.api.submitInput(input, "preview");
  assert.equal(job.id, "approved-job");
  assert.ok(calls.includes("/api/jobs"));
});
