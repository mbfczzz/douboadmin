const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { harness } = require("./harness.cjs");

// Evaluate the actual template condition at every setData boundary, including
// intermediate states before a slow request completes.
const markup = fs.readFileSync("pages/activate/index.wxml", "utf8");
const condition = [...markup.matchAll(/<view wx:if="{{([^"]+)}}" class="biz-card activation-options">/g)]
  .map(match => match[1]).find(value => value.includes("loadError"));
const scanVisible = data => data.logged && !data.status?.profileRequired &&
  !!vm.runInNewContext(condition, { ...data, status: data.status || {} });

async function fixture(status, loadError = "") {
  const h = harness(); await h.api.signIn();
  h.wx.reLaunch = options => h.nav.push(options);
  let response;
  h.wx.request = o => {
    if (o.url.endsWith("/access")) response = o;
    else o.success({ statusCode: 200, data: { wechatLogin: true, wechatPhoneLogin: true } });
  };
  const page = h.page("activate");
  page.owner = h.api.sessionUserId();
  page.setData({ logged: true, loading: false, status, loadError });
  const frames = [];
  const setData = page.setData;
  page.setData = patch => { setData.call(page, patch); frames.push({ scan: scanVisible(page.data), loading: page.data.loading }); };
  const loading = page.load();
  await new Promise(setImmediate);
  return { page, frames, loading, reply: data => response.success({ statusCode: 200, data }), fail: () => response.fail(), h };
}

test("unknown authorization never renders a scan tile while refreshing or entering", async () => {
  const f = await fixture(null);
  assert.ok(f.frames.every(frame => !frame.scan));
  f.reply({ active: true, status: "provider" });
  await f.loading;
  assert.ok(f.frames.every(frame => !frame.scan));
  assert.equal(f.h.nav.at(-1).url, "/pages/templates/index");
});

test("retry retains error state until authoritative result replaces it atomically", async () => {
  for (const status of ["account_disabled", "review", "pending"]) {
    const f = await fixture({ active: false, status: "pending" }, "旧请求失败");
    assert.ok(f.frames.every(frame => !frame.scan));
    assert.equal(f.page.data.loadError, "旧请求失败");
    f.reply({ active: false, status }); await f.loading;
    assert.equal(f.page.data.loadError, "");
    assert.equal(scanVisible(f.page.data), status === "pending");
  }
});

test("another failed refresh never briefly restores scan or submits a stale invite", async () => {
  const f = await fixture({ active: false, status: "pending" }, "旧请求失败");
  let submitted = 0;
  f.h.service("invitation").captureInvite({ scene: "ABCD2345" });
  f.page.join = async () => { submitted++; };
  f.fail(); await f.loading;
  assert.ok(f.frames.every(frame => !frame.scan));
  assert.match(f.page.data.loadError, /连接失败/);
  assert.equal(f.page.data.loading, false);
  assert.equal(submitted, 0);
});

test("an already confirmed scan view stays mounted during a successful pending refresh", async () => {
  const f = await fixture({ active: false, status: "pending" });
  assert.ok(f.frames.every(frame => frame.scan));
  f.reply({ active: false, status: "pending" }); await f.loading;
  assert.ok(f.frames.every(frame => frame.scan));
});
