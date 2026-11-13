const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture(env, stored = new Map()) {
  const calls = [], timers = [], exports = {};
  const code = ts.transpileModule(fs.readFileSync('services/trial-debug.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Promise, Error,
    setTimeout: callback => (timers.push(callback), timers.length),
    clearTimeout() {},
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: env } }),
      setEnableDebug: options => calls.push(options),
      getStorageSync: key => stored.has(key) ? stored.get(key) : '',
      setStorageSync: (key, value) => stored.set(key, value),
    },
  });
  return { ...exports, calls, timers, stored };
}

test('trial overrides old off preference and gates all concurrent startup requests', async () => {
  const f = fixture('trial', new Map([['debug-console', false]]));
  let sent = 0;
  const start = f.initializeDebug();
  const requests = [f.trialDebug(async () => ++sent), f.trialDebug(async () => ++sent)];
  assert.equal(sent, 0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].enableDebug, true);
  f.calls[0].success();
  await Promise.all([start, ...requests]);
  assert.equal(sent, 2);
  assert.equal(f.debugEnabled(), true);
  await f.trialDebug(async () => ++sent);
  assert.equal(f.calls.length, 1);
});

test('release, develop and unknown environments never automatically enable debugging', async () => {
  for (const env of ['release', 'develop', undefined]) {
    const f = fixture(env);
    await f.initializeDebug();
    let sent = false;
    const response = f.trialDebug(async () => { sent = true; });
    assert.equal(sent, true);
    await response;
    assert.ok(f.calls.every(call => call.enableDebug === false));
  }
});

test('trial default is cleared on release but explicit settings are preserved', async () => {
  const storage = new Map();
  const trial = fixture('trial', storage), pending = trial.initializeDebug();
  trial.calls[0].success();
  await pending;
  const release = fixture('release', storage);
  await release.initializeDebug();
  assert.deepEqual(release.calls.map(call => call.enableDebug), [false]);
  release.setDebug(true);
  const nextRelease = fixture('release', storage);
  await nextRelease.initializeDebug();
  assert.equal(nextRelease.calls.length, 0);
});

test('failed or timed-out enable sends no request and allows another attempt', async () => {
  for (const timeout of [false, true]) {
    const f = fixture('trial');
    let sent = 0;
    const first = f.trialDebug(async () => ++sent);
    if (timeout) f.timers[0](); else f.calls[0].fail();
    await assert.rejects(first, /调试开启失败/);
    assert.equal(sent, 0);
    const retry = f.trialDebug(async () => ++sent);
    f.calls[1].success();
    await retry;
    assert.equal(sent, 1);
  }
});

test('manual off lasts until next cold trial launch', async () => {
  const f = fixture('trial'), pending = f.initializeDebug();
  f.calls[0].success();
  await pending;
  f.setDebug(false);
  assert.equal(f.debugEnabled(), false);
  await f.trialDebug(async () => undefined);
  assert.equal(f.calls.length, 2);
  const next = fixture('trial', f.stored), nextPending = next.initializeDebug();
  assert.equal(next.calls[0].enableDebug, true);
  next.calls[0].success();
  await nextPending;
});
