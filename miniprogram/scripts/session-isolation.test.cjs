const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

for (const kind of ["request", "upload"]) {
  test(`late ${kind} 401 neither redirects nor expires a newer session`, async () => {
    const h = harness();
    await h.api.signIn();
    h.storage.set("activation-required", true);
    const moves = [];
    h.wx.reLaunch = (o) => moves.push(o.url);
    let pending;
    if (kind === "request")
      h.wx.request = (o) => {
        pending = o;
      };
    else
      h.wx.uploadFile = (o) => {
        pending = o;
      };
    const call =
      kind === "request" ? h.api.request("/me") : h.api.upload("test.jpg");
    const rejected = assert.rejects(call, /取消登录/);
    await Promise.resolve();
    h.storage.set("douboSession", {
      token: "new-account",
      expiresAt: Date.now() + 100000,
    });
    pending.success({ statusCode: 401, data: kind === "request" ? {} : "{}" });
    await rejected;
    assert.equal(h.api.sessionToken(), "new-account");
    assert.deepEqual(moves, []);
  });
}

test("guest request arriving after login cannot restart the activation flow", async () => {
  const h = harness();
  h.storage.set("activation-required", true);
  const moves = [];
  h.wx.reLaunch = (o) => moves.push(o.url);
  let pending;
  h.wx.request = (o) => {
    pending = o;
  };
  const call = h.api.request("/templates", "GET", undefined, undefined, false);
  const rejected = assert.rejects(call, /取消登录/);
  await Promise.resolve();
  h.storage.set("douboSession", {
    token: "new-account",
    expiresAt: Date.now() + 100000,
  });
  pending.success({ statusCode: 401, data: {} });
  await rejected;
  assert.deepEqual(moves, []);
});

test("owner-bound profile writes are cancelled if identity changes before dispatch", async () => {
  const h = harness();
  await h.api.signIn();
  const owner = h.api.sessionToken(),
    before = h.sent.length;
  queueMicrotask(() =>
    h.storage.set("douboSession", {
      ...h.storage.get("douboSession"),
      token: "new-owner",
    }),
  );
  await assert.rejects(
    h.api.request(
      "/me",
      "PUT",
      { version: 1, nickname: "旧账户草稿" },
      undefined,
      false,
      owner,
    ),
    /取消登录/,
  );
  assert.equal(h.sent.length, before);
});

test("owner-bound avatars are not uploaded under a replacement account", async () => {
  const h = harness();
  await h.api.signIn();
  const owner = h.api.sessionToken();
  let uploads = 0;
  h.wx.uploadFile = (options) => {
    uploads++;
    options.success({
      statusCode: 201,
      data: JSON.stringify({
        id: "wrong-account",
        data: { url: "/avatar.jpg" },
      }),
    });
  };
  queueMicrotask(() =>
    h.storage.set("douboSession", {
      ...h.storage.get("douboSession"),
      token: "new-owner",
    }),
  );
  await assert.rejects(h.api.upload("avatar.jpg", true, owner), /取消登录/);
  assert.equal(uploads, 0);
});
