const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
test("favorite lookup failure does not replace publicly accessible template content", async () => {
  const h = harness();
  await h.api.signIn();
  h.api.request = async (p) => {
    if (p.startsWith("/templates/"))
      return { id: "t", data: { cover: "/cover.jpg", title: "template" } };
    throw new h.api.RequestError(503, "暂时不可用");
  };
  const page = h.page("template-detail");
  page.id = "t";
  await page.load();
  await Promise.resolve();
  assert.equal(page.data.template.id, "t");
  assert.equal(page.data.loadError, "");
});
test("guest favorite resumes against the saved account version instead of version zero", async () => {
  const h = harness();
  let writes = 0;
  h.api.login = () => h.api.signIn();
  h.api.request = async (p, method) => {
    if (method === "PUT") {
      writes++;
      throw new Error("must not overwrite existing favorite");
    }
    assert.equal(p, "/favorites/t");
    return { id: "favorite", version: 7, data: { templateId: "t", active: true } };
  };
  const page = h.page("template-detail");
  page.id = "t";
  await page.favorite();
  assert.equal(page.data.favorite, true);
  assert.equal(page.data.favoriteVersion, 7);
  assert.equal(writes, 0);
});
test("profile conflict preserves the draft and refreshes version for explicit retry; form nickname is current", async () => {
  const h = harness();
  await h.api.signIn();
  const profile = {
    id: "wx-user",
    version: 1,
    data: { nickname: "old", name: "张三", bio: "bio" },
  };
  const page = h.page("profile");
  const writes = [];
  let version = 1;
  h.api.request = async (p, method, data) => {
    if (method === "PUT") {
      writes.push(data);
      if (writes.length === 1) {
        version = 2;
        throw new h.api.RequestError(409, "conflict");
      }
      version = 3;
      return {};
    }
    if (p === "/jobs") return [];
    return {
      profile: { ...profile, version },
      works: 0,
      running: 0,
      favorites: 0,
    };
  };
  await page.load();
  h.wx.navigateBack = (o) => o.success?.({});
  await page.save({
    detail: { value: { nickname: "微信最新填写", bio: "new bio" } },
  });
  assert.equal(page.data.nickname, "微信最新填写");
  assert.equal(page.saved, false);
  assert.equal(page.data.dirty, true);
  assert.equal(page.data.me.profile.version, 2);
  await page.save();
  assert.deepEqual(
    writes.map((v) => v.version),
    [1, 2],
  );
  assert.equal(writes[0].nickname, "微信最新填写");
});
test("oversize avatar is rejected before upload", async () => {
  const h = harness();
  h.wx.getFileSystemManager = () => ({
    getFileInfo: (o) => o.success({ size: 6 * 1024 * 1024 }),
  });
  let uploads = 0;
  h.api.upload = async () => {
    uploads++;
  };
  await h.api.signIn();
  h.api.request = async () => ({
    profile: { version: 1, data: { nickname: "小豆", bio: "" } },
  });
  const page = h.page("profile");
  await page.load();
  await page.chooseAvatar({ detail: { avatarUrl: "large.jpg" } });
  assert.equal(uploads, 0);
  assert.equal(page.data.uploadingAvatar, false);
  assert.match(page.data.avatarError, /5 MB/);
});
test("closing profile editor discards a late avatar selection", async () => {
  const h = harness();
  h.wx.getFileSystemManager = () => ({
    getFileInfo: (o) => o.success({ size: 100 }),
  });
  let resolve, started;
  const uploading = new Promise((r) => (started = r));
  h.api.upload = () =>
    new Promise((r) => {
      resolve = r;
      started();
    });
  await h.api.signIn();
  h.api.request = async () => ({
    profile: { version: 1, data: { nickname: "小豆", bio: "" } },
  });
  const page = h.page("profile");
  await page.load();
  const pending = page.chooseAvatar({ detail: { avatarUrl: "photo.jpg" } });
  await uploading;
  page.onUnload();
  resolve({ id: "late", data: { url: "/late.jpg" } });
  await pending;
  assert.equal(page.data.avatarId, "");
});
test("a request authorized before local expiry keeps its result if the account has not changed", async () => {
  const h = harness();
  await h.api.signIn();
  let response;
  h.wx.request = (o) => (response = o);
  const pending = h.api.request("/me");
  await Promise.resolve();
  const s = h.storage.get("douboSession");
  h.storage.set("douboSession", { ...s, expiresAt: Date.now() - 1 });
  response.success({ statusCode: 200, data: { currentUser: true } });
  assert.equal((await pending).currentUser, true);
});
