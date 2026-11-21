const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { harness } = require("./harness.cjs");

// Loads the shared WXS module the way the view layer runs it.
function wxs() {
  const sandbox = { module: { exports: {} }, getRegExp: (p, f) => new RegExp(p, f) };
  vm.runInNewContext(fs.readFileSync("utils/mentions.wxs", "utf8"), sandbox);
  return sandbox.module.exports;
}
const image = (n) => ({ id: "img" + n, isImage: true, data: { url: "https://fixture.test/" + n } });
const video = (n) => ({ id: "vid" + n, isVideo: true, data: { url: "https://fixture.test/v" + n, thumbnailUrl: "https://fixture.test/c" + n } });

test("a prompt splits into text runs and reference chips; unknown references stay text", () => {
  const { segments } = wxs();
  const parts = segments("这个人@图片1 在@视频1 里跳舞@图片9", [image(1), video(1)]);
  assert.deepEqual(Array.from(parts, (p) => (p.chip ? [p.label, p.url, p.video] : p.text)), [
    "这个人", ["图片1", "https://fixture.test/1", false], " 在", ["视频1", "https://fixture.test/c1", true], " 里跳舞@图片9",
  ]);
  assert.deepEqual(Array.from(segments("", []), (p) => p.text), []);
});

test("create: the prompt box is the thumbnail editor, fed and read as plain text", () => {
  const wxml = fs.readFileSync("pages/create/index.wxml", "utf8");
  assert.match(wxml, /<prompt-editor\s+id="prompt"\s+class="prompt-input"\s+value="\{\{prompt\}\}"\s+assets="\{\{assets\}\}"/);
  assert.doesNotMatch(wxml, /<textarea/);
  assert.ok(wxml.indexOf('<wxs module="refs"') === 0, "the module is declared before use");
});

test("task detail: tapping a video chip plays it, an image chip opens the gallery", () => {
  const h = harness(), page = h.page("task-detail");
  const played = [], shown = [];
  h.wx.previewMedia = (o) => played.push(o.sources[0].url);
  h.wx.previewImage = (o) => shown.push(o.current);
  page.setData({ assets: [{ ...image(1), data: { url: "https://fixture.test/1" } }, { ...video(1), isImage: false }] });
  page.previewChip({ currentTarget: { dataset: { id: "vid1" } } });
  page.previewChip({ currentTarget: { dataset: { id: "img1" } } });
  assert.deepEqual(played, ["https://fixture.test/v1"]);
  assert.deepEqual(shown, ["https://fixture.test/1"]);
});

// On devices WXS regex support differs; the parser must not need getRegExp,
// and a full-width ＠ from a Chinese keyboard still counts.
test("chips parse without any regex helper and accept a full-width ＠", () => {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync("utils/mentions.wxs", "utf8"), sandbox);
  const { segments, list } = sandbox.module.exports;
  const parts = segments("这个＠图片1 美女@视频1", [image(1), video(1)]);
  assert.deepEqual(Array.from(parts, (p) => (p.chip ? p.label : p.text)), ["这个", "图片1", " 美女", "视频1"]);
  assert.equal(list("这个@图片1 美女", [image(1)]).length, 1);
  assert.equal(list("@图片 美女 @图", [image(1)]).length, 0);
});

test("picking after a full-width ＠ writes a standard @", () => {
  const h = harness(), page = h.page("create");
  page.setData({ assets: [{ ...image(1), data: { url: "https://fixture.test/1", type: "image/png" } }], prompt: "", maxPromptChars: 500 });
  page.input({ detail: { value: "这个＠", cursor: 3 } });
  assert.equal(page.data.mentionOpen, true);
  page.pickMention({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(page.data.prompt, "这个@图片1 ");
});

test("each reference tile is numbered the way @ mentions count it", () => {
  const { label } = wxs();
  const assets = [image(1), video(1), image(2), { id: "a", data: { type: "audio/mpeg" } }];
  assert.deepEqual([0, 1, 2, 3].map((i) => label(assets, i)), ["图1", "视频1", "图2", ""]);
  const wxml = fs.readFileSync("pages/create/index.wxml", "utf8");
  assert.match(wxml, /class="reference-no">\{\{refs\.label\(assets,index\)\}\}/);
});
