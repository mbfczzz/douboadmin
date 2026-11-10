const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

function me() {
  return {
    profile: {
      id: "wx-user",
      version: 1,
      data: {
        nickname: "小豆",
        bio: "创作日常",
        name: "",
        phone: "",
        avatarId: "",
      },
    },
    works: 0,
    running: 0,
    favorites: 0,
  };
}
async function editor(h) {
  await h.api.signIn();
  h.api.request = async () => me();
  const page = h.page("profile");
  await page.load();
  return page;
}
function input(page, field, value) {
  page.input({ currentTarget: { dataset: { field } }, detail: { value } });
}

test("My profile opens the dedicated editor once instead of an overlay", () => {
  const h = harness(),
    page = h.page("mine");
  page.setData({ me: me() });
  page.edit();
  page.edit();
  assert.equal(h.nav.length, 1);
  assert.equal(h.nav[0].url, "/pages/profile/index");
  assert.equal(page.data.profileOpen, undefined);
});

test("back confirmation preserves a cancelled draft and disables the native guard before leaving", async () => {
  const h = harness(),
    page = await editor(h);
  let confirm = false,
    enabled = false,
    backs = 0;
  h.wx.enableAlertBeforeUnload = () => {
    enabled = true;
  };
  h.wx.disableAlertBeforeUnload = () => {
    enabled = false;
  };
  h.wx.showModal = async () => ({ confirm });
  h.wx.navigateBack = (options) => {
    assert.equal(enabled, false);
    backs++;
    options.success({});
  };
  input(page, "nickname", "我的新昵称");
  assert.equal(enabled, true);
  await page.back();
  assert.equal(backs, 0);
  assert.equal(page.data.nickname, "我的新昵称");
  assert.equal(enabled, true);
  confirm = true;
  await page.back();
  assert.equal(backs, 1);
});

test("a pending save cannot be duplicated or interrupted by the custom back button", async () => {
  const h = harness(),
    page = await editor(h);
  let finish,
    writes = 0,
    backs = 0;
  h.wx.navigateBack = (options) => {
    backs++;
    options.success({});
  };
  h.api.request = async () => {
    writes++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = page.save({
    detail: { value: { nickname: "提交时最新昵称" } },
  });
  await page.save();
  await page.back();
  assert.equal(writes, 1);
  assert.equal(backs, 0);
  finish({});
  await first;
  assert.equal(page.saved, true);
  assert.equal(page.data.dirty, false);
  assert.equal(backs, 1);
});

test("account change while reading an avatar cannot upload or expose the previous draft", async () => {
  const h = harness(),
    page = await editor(h);
  let file,
    uploads = 0;
  h.wx.getFileSystemManager = () => ({
    getFileInfo: (options) => {
      file = options;
    },
  });
  h.api.upload = async () => {
    uploads++;
  };
  input(page, "phone", "13800000000");
  const pending = page.chooseAvatar({ detail: { avatarUrl: "photo.jpg" } });
  h.storage.set("douboSession", {
    token: "other-account",
    expiresAt: Date.now() + 100000,
  });
  file.success({ size: 100 });
  await pending;
  assert.equal(uploads, 0);
  assert.equal(page.data.me, null);
  assert.equal(page.data.phone, "");
  assert.equal(page.data.uploadingAvatar, false);
  assert.equal(page.data.needsLogin, true);
});

test("a stale profile response cannot populate the editor after account replacement", async () => {
  const h = harness();
  await h.api.signIn();
  let finish;
  h.api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const page = h.page("profile"),
    pending = page.load();
  h.storage.set("douboSession", {
    token: "other-account",
    expiresAt: Date.now() + 100000,
  });
  finish(me());
  await pending;
  assert.equal(page.data.me, null);
  assert.equal(page.data.nickname, "");
});

test("saving in the background does not pull the user away until this page is shown", async () => {
  const h = harness(),
    page = await editor(h);
  let finish,
    backs = 0;
  h.wx.navigateBack = (options) => {
    backs++;
    options.success({});
  };
  h.api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  input(page, "bio", "保留这段新简介");
  const pending = page.save();
  page.onHide();
  finish({});
  await pending;
  assert.equal(backs, 0);
  assert.equal(page.saved, true);
  page.onShow();
  await new Promise(setImmediate);
  assert.equal(backs, 1);
});

test("failed saves retain all fields and permit retry without navigating", async () => {
  const h = harness(),
    page = await editor(h);
  h.api.request = async () => {
    throw new Error("网络暂不可用");
  };
  input(page, "name", "小豆本人");
  input(page, "bio", "新的简介");
  await page.save();
  assert.equal(page.data.name, "小豆本人");
  assert.equal(page.data.bio, "新的简介");
  assert.equal(page.data.saveError, "网络暂不可用");
  assert.equal(page.data.dirty, true);
  assert.equal(page.data.busy, false);
});

test("the shared navigation delegates editor back events and preserves ordinary navigation", () => {
  const h = harness(),
    bar = h.component("components/nav-bar");
  let delegated = 0,
    ordinary = 0;
  bar.triggerEvent = (name) => {
    assert.equal(name, "back");
    delegated++;
  };
  h.wx.navigateBack = () => {
    ordinary++;
  };
  bar.setData({ interceptBack: true });
  bar.goBack();
  assert.equal(delegated, 1);
  assert.equal(ordinary, 0);
  bar.setData({ interceptBack: false });
  bar.goBack();
  assert.equal(ordinary, 1);
});
