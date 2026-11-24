const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function fixture(env, stored = new Map()) {
  const calls = [], timers = [], exports = {};
  const code = ts.transpileModule(
    fs.readFileSync("services/trial-debug.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    Promise,
    Error,
    setTimeout: (callback) => (timers.push(callback), timers.length),
    clearTimeout() {},
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: env } }),
      setEnableDebug: (options) => calls.push(options),
      getStorageSync: (key) => (stored.has(key) ? stored.get(key) : ""),
      setStorageSync: (key, value) => stored.set(key, value),
    },
  });
  return { ...exports, calls, timers, stored };
}

test("trial enables debug once and gates concurrent startup requests", async () => {
  const f = fixture("trial", new Map([["debug-console", false]]));
  let sent = 0;
  const start = f.initializeDebug();
  const requests = [
    f.trialDebug(async () => ++sent),
    f.trialDebug(async () => ++sent),
  ];
  assert.equal(sent, 0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].enableDebug, true);
  f.calls[0].success();
  await Promise.all([start, ...requests]);
  assert.equal(sent, 2);
  assert.equal(f.debugEnabled(), true);
});

test("release, develop and unknown environments never auto-enable", async () => {
  for (const env of ["release", "develop", undefined]) {
    const f = fixture(env);
    await f.initializeDebug();
    let sent = false;
    const response = f.trialDebug(async () => { sent = true; });
    assert.equal(sent, true);
    await response;
    assert.ok(f.calls.every((call) => call.enableDebug === false));
  }
});

test("automatic trial state is cleared on release, manual state is kept", async () => {
  const storage = new Map();
  const trial = fixture("trial", storage), pending = trial.initializeDebug();
  trial.calls[0].success();
  await pending;
  const release = fixture("release", storage);
  await release.initializeDebug();
  assert.deepEqual(release.calls.map((call) => call.enableDebug), [false]);
  release.setDebug(true);
  const next = fixture("release", storage);
  await next.initializeDebug();
  assert.equal(next.calls.length, 0);
});

test("failed or timed-out enable sends no request and permits retry", async () => {
  for (const timeout of [false, true]) {
    const f = fixture("trial");
    let sent = 0;
    const first = f.trialDebug(async () => ++sent);
    if (timeout) f.timers[0]();
    else f.calls[0].fail();
    await assert.rejects(first, /调试开启失败/);
    assert.equal(sent, 0);
    const retry = f.trialDebug(async () => ++sent);
    f.calls[1].success();
    await retry;
    assert.equal(sent, 1);
  }
});
