const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
test("concurrent WeChat sign-in exchanges one fresh code, stores only business session", async () => {
  const h = harness();
  await Promise.all([h.api.signIn(), h.api.signIn(), h.api.signIn()]);
  assert.equal(h.loginCount(), 1);
  assert.equal(h.sent.length, 1);
  assert.ok(h.sent[0].url.endsWith("/auth/wechat"));
  assert.equal(
    JSON.stringify(h.sent[0].data),
    JSON.stringify({ code: "fresh-code-1" }),
  );
  assert.equal(h.api.hasSession(), true);
  const stored = JSON.stringify([...h.storage.values()]);
  assert.ok(!stored.includes("fresh-code"));
  assert.ok(!stored.includes("session_key"));
});
test("invalid code requires fresh code and never falls back to demo", async () => {
  const h = harness();
  let calls = 0;
  h.wx.request = (o) => {
    h.sent.push(o);
    o.success(
      ++calls === 1
        ? { statusCode: 401, data: { error: "凭证失效" } }
        : {
            statusCode: 200,
            data: {
              token: "real",
              userId: "wx-user",
              expiresIn: 86400,
              provider: "wechat",
            },
          },
    );
  };
  await assert.rejects(h.api.signIn(), /凭证失效/);
  assert.equal(h.api.hasSession(), false);
  await h.api.signIn();
  assert.equal(h.loginCount(), 2);
  assert.equal(h.sent[1].data.code, "fresh-code-2");
  assert.ok(
    h.sent.every((r) => r.url.endsWith("/auth/wechat") && !r.data.demoId),
  );
});
test("one login page for concurrent protected actions, cancellation rejects both", async () => {
  const h = harness();
  const one = h.api.login(),
    two = h.api.login();
  const rejected = Promise.all([
    assert.rejects(one, /取消登录/),
    assert.rejects(two, /取消登录/),
  ]);
  assert.equal(h.nav.length, 1);
  h.api.cancelLogin();
  await rejected;
  assert.equal(h.sent.length, 0);
});
test("successful login resumes a protected request without losing its idempotency key", async () => {
  const h = harness();
  const action = h.api.request(
    "/jobs",
    "POST",
    { prompt: "保留输入" },
    "stable-key",
  );
  assert.equal(h.nav.length, 1);
  await h.api.signIn();
  h.api.completeLogin();
  await action;
  assert.equal(h.sent[1].header["Idempotency-Key"], "stable-key");
  assert.equal(h.sent[1].data.prompt, "保留输入");
  assert.equal(h.sent[1].header.Authorization, "Bearer opaque-token");
});
test("cancelling while wx.login is pending does not resurrect a local session", async () => {
  const h = harness();
  let resolve;
  h.wx.login = () =>
    new Promise((r) => {
      resolve = r;
    });
  const wait = h.api.login();
  const waitRejected = assert.rejects(wait, /取消登录/);
  const exchange = h.api.signIn();
  const exchangeRejected = assert.rejects(exchange, /取消登录/);
  h.api.cancelLogin();
  resolve({ code: "late-code" });
  await Promise.all([waitRejected, exchangeRejected]);
  assert.equal(h.api.hasSession(), false);
});
test("late 401 cannot clear a newer login session; dependency failures preserve it", async () => {
  const h = harness();
  await h.api.signIn();
  let captured;
  h.wx.request = (o) => {
    captured = o;
  };
  const action = h.api.request("/me");
  const rejected = assert.rejects(action, /取消登录/);
  await Promise.resolve();
  h.storage.set("douboSession", {
    token: "new-token",
    expiresAt: Date.now() + 100000,
  });
  captured.success({ statusCode: 401, data: { error: "expired" } });
  await rejected;
  assert.equal(h.api.sessionToken(), "new-token");
  h.wx.request = (o) =>
    o.success({ statusCode: 503, data: { error: "会话服务不可用" } });
  await assert.rejects(h.api.request("/me"), /会话服务不可用/);
  assert.equal(h.api.sessionToken(), "new-token");
});
test("logout revokes on the server then clears local session; no silent relogin", async () => {
  const h = harness();
  await h.api.signIn();
  await h.api.logout();
  assert.ok(h.sent[1].url.endsWith("/auth/logout"));
  assert.equal(h.api.hasSession(), false);
  const next = h.api.login();
  const rejected = assert.rejects(next, /取消登录/);
  assert.equal(h.loginCount(), 1);
  assert.equal(h.nav.length, 1);
  h.api.cancelLogin();
  await rejected;
});
test("logout network error leaves credentials available for revocation retry", async () => {
  const h = harness();
  await h.api.signIn();
  h.wx.request = (o) => o.fail();
  await assert.rejects(h.api.logout(), /连接失败/);
  assert.equal(h.api.hasSession(), true);
});
test("locally expired credentials are still revoked without opening login", async () => {
  const h = harness();
  h.storage.set("douboSession", {
    token: "expired-token",
    expiresAt: Date.now() - 1000,
  });
  h.wx.request = (o) => {
    h.sent.push(o);
    o.success({ statusCode: 401, data: { error: "already expired" } });
  };
  await h.api.logout();
  assert.equal(h.sent[0].header.Authorization, "Bearer expired-token");
  assert.equal(h.storage.has("douboSession"), false);
  assert.equal(h.nav.length, 0);
});
test("cancel then immediately reopen starts a fresh exchange; old completion cannot clear it", async () => {
  const h = harness(),
    resolvers = [];
  h.wx.login = () => new Promise((r) => resolvers.push(r));
  const old = h.api.signIn();
  const rejected = assert.rejects(old, /取消登录/);
  h.api.cancelLogin();
  const fresh = h.api.signIn();
  assert.equal(resolvers.length, 2);
  resolvers[0]({ code: "obsolete" });
  await rejected;
  const same = h.api.signIn();
  assert.equal(resolvers.length, 2);
  resolvers[1]({ code: "fresh" });
  await Promise.all([fresh, same]);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].data.code, "fresh");
  assert.equal(h.api.hasSession(), true);
});
test("successful private responses after logout are discarded", async () => {
  const h = harness();
  await h.api.signIn();
  let response;
  h.wx.request = (o) => (response = o);
  const request = h.api.request("/me");
  const rejected = assert.rejects(request, /取消登录/);
  await Promise.resolve();
  h.api.clearSession();
  response.success({ statusCode: 200, data: { private: "old profile" } });
  await rejected;
});
test("an old upload response cannot attach files to a new account", async () => {
  const h = harness();
  await h.api.signIn();
  let upload;
  h.wx.uploadFile = (o) => (upload = o);
  const pending = h.api.upload("file");
  const rejected = assert.rejects(pending, /取消登录/);
  await Promise.resolve();
  h.storage.set("douboSession", {
    token: "different-user",
    expiresAt: Date.now() + 100000,
  });
  upload.success({
    statusCode: 201,
    data: JSON.stringify({ id: "old-owner", data: { url: "/media/a.jpg" } }),
  });
  await rejected;
});
test("logout succeeds if another request already cleared the expired local token", async () => {
  const h = harness();
  await h.api.signIn();
  let response;
  h.wx.request = (o) => (response = o);
  const pending = h.api.logout();
  h.api.clearSession();
  response.success({ statusCode: 401, data: {} });
  await pending;
  assert.equal(h.api.hasSession(), false);
});
