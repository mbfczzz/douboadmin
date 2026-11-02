const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("My works refresh while generation is pending and stop after leaving the page", async () => {
  const timers = new Map();
  let next = 0;
  const h = harness({
    setTimeout(fn) {
      const id = ++next;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  await h.api.signIn();
  const page = h.page("mine");
  let running = 1;
  h.api.request = async (p) =>
    p === "/jobs"
      ? []
      : {
          profile: { version: 1, data: { nickname: "小豆", bio: "" } },
          works: 0,
          running,
          favorites: 0,
        };
  await page.load();
  assert.equal(timers.size, 1);
  page.edit();
  assert.equal(timers.size, 0);
  page.close();
  assert.equal(timers.size, 1);
  page.onHide();
  assert.equal(timers.size, 0);
  page.visible = true;
  running = 0;
  await page.load();
  assert.equal(timers.size, 0);
});

test("background refresh does not silently change the version of an open profile draft", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("mine");
  let version = 1,
    written;
  h.api.request = async (p, method, body) => {
    if (method === "PUT") {
      written = body.version;
      throw new h.api.RequestError(409, "conflict");
    }
    return p === "/jobs"
      ? []
      : {
          profile: { version, data: { nickname: "小豆", bio: "" } },
          works: 0,
          running: 0,
          favorites: 0,
        };
  };
  await page.load();
  page.edit();
  version = 2;
  await page.load();
  page.setData({ nickname: "我的新昵称" });
  await page.save();
  assert.equal(written, 1);
  assert.equal(page.data.nickname, "我的新昵称");
  assert.equal(page.editVersion, 2);
});
