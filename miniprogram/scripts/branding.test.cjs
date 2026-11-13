const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");
const logo = "https://fixture.oss-cn-shanghai.aliyuncs.com/system/brand/hash/doubo.png?x-oss-signature=fixture";

for (const name of ["activate", "login"]) {
  test(name + " loads branding separately and can retry a failed image", async () => {
    const h = harness(), page = h.page(name);
    assert.equal(page.data.brandIcon, "");
    const calls = [];
    h.api.request = async (path, method, body, key, auth) => {
      calls.push([path, auth]);
      return path === "/branding" ? { icon: logo } : { wechatLogin: true };
    };
    await page.load();
    assert.equal(page.data.brandIcon, logo);
    assert.equal(page.data.wechatReady, true);
    assert.deepEqual(calls, [["/branding", false], ["/config", false]]);
    page.brandError();
    assert.equal(page.data.brandIcon, "");
    await page.load();
    assert.equal(page.data.brandIcon, logo);
    const markup = fs.readFileSync("pages/" + name + "/index.wxml", "utf8");
    assert.match(markup, /<image wx:if="{{brandIcon}}"/);
    assert.match(markup, /binderror="brandError"/);
    assert.match(markup, /wx:else[^>]*brand-placeholder[^>]*bindtap="load"/);
  });
  test(name + " rejects HTTP logos and keeps login independent of branding failure", async () => {
    const h = harness(), page = h.page(name);
    for (const icon of [undefined, "/api/brand-icon", "http://fixture.test/logo.png", "https://", "//fixture.test/logo.png"]) {
      h.api.request = async (path) => path === "/branding" ? { icon } : { wechatLogin: true };
      await page.load();
      assert.equal(page.data.brandIcon, "");
      assert.equal(page.data.wechatReady, true);
    }
    h.api.request = async (path) => {
      if (path === "/branding") throw new Error("network unavailable");
      return { wechatLogin: true };
    };
    await page.load();
    assert.equal(page.data.brandIcon, "");
    assert.equal(page.data.loadError, "");
    assert.equal(page.data.wechatReady, true);
  });
  test(name + " can show the OSS logo while config is still pending", async () => {
    const h = harness(), page = h.page(name);
    let release;
    h.api.request = (path) => path === "/branding" ? Promise.resolve({ icon: logo }) : new Promise(resolve => { release = resolve; });
    const pending = page.load();
    await new Promise(setImmediate);
    assert.equal(page.data.brandIcon, logo);
    assert.equal(page.data.loading, true);
    release({ wechatLogin: true });
    await pending;
  });
}

test("already signed-in activation still fetches branding", async () => {
  const h = harness(), page = h.page("activate");
  await h.api.signIn();
  h.service("access").accessStatus = async () => ({ active: false, status: "pending" });
  const calls = [];
  h.api.request = async (path) => { calls.push(path); return { icon: logo }; };
  await page.load();
  assert.equal(page.data.brandIcon, logo);
  assert.equal(page.data.logged, true);
  assert.deepEqual(calls, ["/branding"]);
});

test("late or superseded branding responses never replace the current logo", async () => {
  const h = harness(), page = h.page("activate"), service = h.service("branding");
  let release;
  const first = service.loadBrand(page, () => new Promise(resolve => { release = resolve; }));
  await service.loadBrand(page, async () => ({ icon: logo }));
  release({ icon: "https://fixture.test/old.png" });
  await first;
  assert.equal(page.data.brandIcon, logo);
  page.onUnload();
  await service.loadBrand(page, async () => ({ icon: "https://fixture.test/late.png" }));
  assert.equal(page.data.brandIcon, logo);
});
