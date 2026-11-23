const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture(env, stored = new Map()) {
  const calls = [], exports = {};
  const code = ts.transpileModule(fs.readFileSync('services/trial-debug.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Promise, Error,
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: env } }),
      setEnableDebug: options => calls.push(options),
      getStorageSync: key => stored.has(key) ? stored.get(key) : '',
      setStorageSync: (key, value) => stored.set(key, value),
    },
  });
  return { ...exports, calls, stored };
}

test('no environment automatically enables debugging or delays requests', async () => {
  for (const env of ['trial', 'release', 'develop', undefined]) {
    const f = fixture(env);
    await f.initializeDebug();
    let sent = false;
    const response = f.trialDebug(async () => { sent = true; });
    assert.equal(sent, true);
    await response;
    assert.equal(f.calls.length, 0);
  }
});

test('legacy automatic debug is cleared while a manual preference survives', async () => {
  const automatic = fixture('trial', new Map([['debug-console', true], ['trial-debug-default', true]]));
  await automatic.initializeDebug();
  assert.equal(automatic.debugEnabled(), false);
  assert.deepEqual(automatic.calls.map(call => call.enableDebug), [false]);
  const manual = fixture('trial', new Map([['debug-console', true], ['trial-debug-default', false]]));
  await manual.initializeDebug();
  assert.equal(manual.debugEnabled(), true);
  assert.equal(manual.calls.length, 0);
});
