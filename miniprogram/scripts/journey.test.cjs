const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const job = (assets = []) => ({
  id: "job-1",
  status: "succeeded",
  createdAt: "2026-10-31T10:00:00Z",
  result: "/media/demo/example.jpg",
  input: {
    kind: "image",
    model: "demo-image",
    prompt: "测试作品",
    resolution: "1K",
    ratio: "1:1",
    assets,
  },
});

test("guests can cancel task login and return without being redirected again", async () => {
  const h = harness(),
    page = h.page("tasks");
  page.onShow();
  assert.equal(page.data.needsLogin, true);
  assert.equal(h.nav.length, 0);
  const attempt = page.signIn();
  assert.equal(h.nav.length, 1);
  h.api.cancelLogin();
  await attempt;
  page.onShow();
  await page.load();
  assert.equal(h.nav.length, 1);
  assert.equal(page.data.signingIn, false);
  page.onUnload();
});

test("private detail and favorites do not force guest login on page show", async () => {
  const h = harness(),
    detail = h.page("task-detail"),
    library = h.page("library");
  await detail.load();
  await library.load();
  assert.equal(detail.data.needsLogin, true);
  assert.equal(library.data.needsLogin, true);
  assert.equal(h.nav.length, 0);
});

test("temporary task refresh failure keeps the previously displayed work", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("tasks");
  h.api.request = async () => [job()];
  await page.load();
  h.api.request = async () => {
    throw new Error("offline");
  };
  await page.load();
  assert.equal(page.data.jobs.length, 1);
  assert.equal(page.data.needsLogin, false);
  assert.ok(page.data.loadError);
});

test("missing reference assets do not hide a completed result", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  page.id = "job-1";
  h.api.request = async (path) => {
    if (path.startsWith("/jobs/")) return job(["missing"]);
    throw new Error("asset unavailable");
  };
  await page.load();
  assert.equal(page.data.job.status, "succeeded");
  assert.ok(page.data.job.result);
  assert.equal(page.data.loadError, "");
  assert.ok(page.data.assetError);
});

test("returning from a template refreshes changes to favorites", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("library");
  let active = true;
  h.api.request = async (path) =>
    path === "/favorites"
      ? [{ data: { templateId: "template-1", active } }]
      : [{ id: "template-1", data: { cover: "/cover.jpg" } }];
  await page.load();
  assert.equal(page.data.templates.length, 1);
  active = false;
  page.onShow();
  await new Promise(setImmediate);
  assert.equal(page.data.templates.length, 0);
});

test("feedback validates whitespace and preserves new text typed during submission", async () => {
  const h = harness(),
    page = h.page("library");
  let calls = 0,
    done,
    sent;
  h.api.request = async (path, method, data) => {
    calls++;
    sent = data;
    await new Promise((resolve) => {
      done = resolve;
    });
  };
  page.input({ detail: { value: "   " } });
  await page.send();
  assert.equal(calls, 0);
  page.input({ detail: { value: "  第一条建议  " } });
  const pending = page.send();
  await new Promise(setImmediate);
  page.input({ detail: { value: "接着写另一条建议" } });
  done();
  await pending;
  assert.equal(sent.content, "第一条建议");
  assert.equal(page.data.content, "接着写另一条建议");
  assert.equal(page.data.canSend, true);
});

test("Agent does not erase a follow-up message while sending the previous one", async () => {
  const h = harness(),
    page = h.page("agent");
  let done;
  h.api.submitInput = () =>
    new Promise((resolve) => {
      done = resolve;
    });
  page.input({ detail: { value: "先写一段脚本" } });
  h.api.request = async (path) => path === "/config" ? {models:[{id:"text-fixture",kind:"chat"}]} : [];
  const pending = page.send();
  await new Promise(setImmediate);
  page.input({ detail: { value: "再补充一个镜头" } });
  done({
    id: "chat-1",
    status: "queued",
    input: { kind: "chat", prompt: "先写一段脚本" },
  });
  await pending;
  assert.equal(page.data.prompt, "再补充一个镜头");
});

test("photo upload confirmation retries navigation without uploading or attaching twice", async () => {
  const h = harness(),
    page = h.page("upload-preview");
  let uploads = 0,
    attachments = 0;
  page.setData({ path: "photo.jpg" });
  h.api.upload = async () => {
    uploads++;
    return { id: "asset-1", data: { type: "image/jpeg" } };
  };
  page.getOpenerEventChannel = () => ({
    emit: () => {
      attachments++;
    },
  });
  h.wx.navigateBack = ({ fail }) => fail();
  await page.confirm();
  assert.equal(page.data.uploaded, true);
  h.wx.navigateBack = ({ success }) => success();
  await page.confirm();
  assert.equal(uploads, 1);
  assert.equal(attachments, 1);
});

test("leaving photo confirmation prevents a late upload from attaching itself", async () => {
  const h = harness(),
    page = h.page("upload-preview");
  let done,
    attachments = 0;
  page.setData({ path: "photo.jpg" });
  h.api.upload = () =>
    new Promise((resolve) => {
      done = resolve;
    });
  page.getOpenerEventChannel = () => ({
    emit: () => {
      attachments++;
    },
  });
  const pending = page.confirm();
  page.onUnload();
  done({ id: "late" });
  await pending;
  assert.equal(attachments, 0);
});

test("saving a work twice while downloading starts only one download", async () => {
  const h = harness(),
    page = h.page("task-detail");
  let calls = 0,
    download;
  page.setData({ job: job() });
  h.wx.downloadFile = (options) => {
    calls++;
    download = options;
  };
  h.wx.saveImageToPhotosAlbum = async () => ({});
  const first = page.save();
  await page.save();
  assert.equal(calls, 1);
  download.success({ statusCode: 200, tempFilePath: "result.jpg" });
  await first;
  assert.equal(page.data.busy, false);
});

test("explicit logout clears private drafts but preserves unrelated local preferences", async () => {
  const h = harness();
  await h.api.signIn();
  for (const key of ["edit-draft", "mix-draft", "pending-create", "retry-job"])
    h.storage.set(key, { private: true });
  h.storage.set("appearance", "dark");
  h.wx.getStorageInfoSync = () => ({ keys: [...h.storage.keys()] });
  await h.api.logout();
  for (const key of ["edit-draft", "mix-draft", "pending-create", "retry-job"])
    assert.equal(h.storage.has(key), false);
  assert.equal(h.storage.get("appearance"), "dark");
});
