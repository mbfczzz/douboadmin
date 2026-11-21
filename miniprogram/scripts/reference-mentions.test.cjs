const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const image = (n) => ({
  id: "image-" + n,
  isImage: true,
  data: {
    name: "图片" + n + ".png",
    url: "https://fixture.test/" + n,
    type: "image/png",
  },
});
const event = (value, cursor = value.length) => ({ detail: { value, cursor } });

const pick = (page, index) => page.pickMention({ currentTarget: { dataset: { index } } });

test("typing @ opens an inline thumbnail picker and inserts the picked image at the cursor", () => {
  const h = harness(),
    page = h.page("create");
  page.setData({
    assets: [
      image(1),
      { id: "video", isImage: false, isVideo: true, data: { type: "video/mp4", url: "https://fixture.test/v.mp4", thumbnailUrl: "https://fixture.test/v.jpg" } },
      image(2),
    ],
    prompt: "",
    maxPromptChars: 500,
  });
  page.input(event("参考@保持人物", 3));
  assert.equal(page.data.mentionOpen, true);
  // Images first, then videos (with their cover), each numbered by kind.
  assert.deepEqual(
    Array.from(page.data.mentionItems, (m) => [m.id, m.label, m.url]),
    [
      ["image-1", "图片1", "https://fixture.test/1"],
      ["image-2", "图片2", "https://fixture.test/2"],
      ["video", "视频1", "https://fixture.test/v.jpg"],
    ],
  );
  pick(page, 1);
  assert.equal(page.data.mentionOpen, false);
  assert.equal(page.data.prompt, "参考@图片2 保持人物");
  assert.equal(page.data.assets.length, 3);
});

test("every uploaded image is in the grid and a stale pick is discarded", () => {
  const h = harness(),
    page = h.page("create");
  page.setData({
    assets: Array.from({ length: 12 }, (_, i) => image(i)),
    maxPromptChars: 500,
  });
  page.input(event("@"));
  assert.equal(page.data.mentionItems.length, 12);
  pick(page, 11);
  assert.equal(page.data.prompt, "@图片12 ");
  page.input(event("@"));
  page.setData({ prompt: "已修改" });
  pick(page, 0);
  assert.equal(page.data.prompt, "已修改");
});

test("cancel, missing images, prompt limits and page hide preserve the draft", () => {
  const h = harness(),
    page = h.page("create");
  let toasts = 0;
  h.wx.showToast = () => toasts++;
  page.input(event("@"));
  assert.equal(toasts, 1);
  assert.equal(page.data.mentionOpen, false);
  page.setData({ assets: [image(1)], maxPromptChars: 2 });
  page.input(event("@"));
  pick(page, 0);
  assert.equal(page.data.prompt, "@");
  assert.equal(toasts, 2);
  page.setData({ maxPromptChars: 500 });
  page.input(event("@"));
  page.closeMention();
  assert.equal(page.data.mentionOpen, false);
  pick(page, 0);
  assert.equal(page.data.prompt, "@");
  page.input(event("@"));
  page.onHide();
  assert.equal(page.data.mentionOpen, false);
  pick(page, 0);
  assert.equal(page.data.prompt, "@");
});

test("removing a reference clears that mention and renumbers later images only", () => {
  const h = harness(),
    page = h.page("create");
  page.refreshParameters = () => {};
  page.setData({
    assets: [image(1), image(2), image(3)],
    prompt: "@图片1 作为背景，@图片2 和 @图片3 保持姿态",
  });
  page.remove({ currentTarget: { dataset: { id: "image-2" } } });
  assert.equal(page.data.prompt, "@图片1 作为背景， 和 @图片2 保持姿态");
  assert.equal(page.data.assets.length, 2);
});

test("clearing references removes every image mention but keeps ordinary text",()=>{
  const h=harness(),page=h.page("create");
  page.refreshParameters=()=>{};
  page.setData({assets:[image(1),image(2)],prompt:"让 @图片1 与 @图片2 同框"});
  page.clearReferences();
  assert.equal(page.data.prompt,"让  与  同框");
  assert.equal(page.data.hasPrompt,true);
  assert.equal(page.data.assets.length,0);
});

test("the viewer quotes or deletes the image it shows", () => {
  const h = harness(),
    page = h.page("create"),
    toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  page.refreshParameters = () => {};
  page.setData({ assets: [image(1), image(2)], prompt: "海边", maxPromptChars: 500, viewerOpen: true });
  page.viewerMention({ detail: { id: "image-2" } });
  assert.equal(page.data.prompt, "海边 @图片2 ");
  assert.equal(page.data.viewerOpen, false);
  assert.deepEqual(toasts, ["已引用图片2"]);
  page.setData({ viewerOpen: true });
  page.viewerRemove({ detail: { id: "image-2" } });
  assert.equal(page.data.prompt, "海边  ");
  assert.equal(page.data.assets.length, 1);
  assert.equal(page.data.viewerOpen, false);
});

test("videos can be referenced; removing one renumbers only its own kind", () => {
  const h = harness(), page = h.page("create");
  const video = (n) => ({ id: "video-" + n, isImage: false, isVideo: true, data: { type: "video/mp4", url: "https://fixture.test/v" + n, thumbnailUrl: "" } });
  page.setData({ assets: [image(1), video(1), video(2)], prompt: "", maxPromptChars: 500 });
  page.input(event("@"));
  pick(page, 2);
  assert.equal(page.data.prompt, "@视频2 ");
  page.setData({ prompt: "@图片1 跳舞，参考 @视频1 和 @视频2" });
  page.removeAsset("video-1");
  assert.equal(page.data.prompt, "@图片1 跳舞，参考  和 @视频1");
});

// The row under the editor lists what the prompt references, in mention order.
test("the referenced row lists mentioned images and videos once each", () => {
  global.getRegExp = (pattern, flags) => new RegExp(pattern, flags);
  const vm = require("node:vm"), fs = require("node:fs");
  const sandbox = { module: { exports: {} }, getRegExp: global.getRegExp };
  vm.runInNewContext(fs.readFileSync("utils/mentions.wxs", "utf8"), sandbox);
  const { list } = sandbox.module.exports;
  const assets = [image(1), { id: "clip", isVideo: true, data: { thumbnailUrl: "https://fixture.test/c.jpg" } }, image(2)];
  const out = list("@视频1 开场，@图片2 结尾，再用 @视频1 和 @图片9", assets);
  assert.deepEqual(Array.from(out, (o) => [o.id, o.label, o.url, o.video]), [
    ["clip", "视频1", "https://fixture.test/c.jpg", true],
    ["image-2", "图片2", "https://fixture.test/2", false],
    ["图片9", "图片9", "", false], // not uploaded yet: 待上传
  ]);
  assert.equal(list("没有引用", assets).length, 0);
  const { any } = sandbox.module.exports;
  assert.equal(any(assets), true);
  assert.equal(any([{ id: "voice", data: {} }]), false, "audio alone offers nothing to @");
});

test("tapping a referenced video plays it full screen with its cover", () => {
  const h = harness(), page = h.page("create");
  let shown;
  h.wx.previewMedia = (o) => { shown = o; };
  page.setData({ assets: [{ id: "clip", isImage: false, isVideo: true, data: { type: "video/mp4", url: "https://fixture.test/c.mp4", thumbnailUrl: "https://fixture.test/c.jpg" } }] });
  page.previewReference({ currentTarget: { dataset: { id: "clip" } } });
  assert.deepEqual({ ...shown.sources[0] }, { url: "https://fixture.test/c.mp4", type: "video", poster: "https://fixture.test/c.jpg" });
});
