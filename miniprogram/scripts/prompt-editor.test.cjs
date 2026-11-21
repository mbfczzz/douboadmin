const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const image = (n) => ({ id: "img" + n, isImage: true, data: { url: "https://fixture.test/" + n + ".png" } });
const video = (n, cover = "") => ({ id: "vid" + n, isImage: false, isVideo: true, data: { url: "https://fixture.test/v" + n, thumbnailUrl: cover } });
const plain = (ops) => JSON.parse(JSON.stringify(ops));

// Draw via delta, not HTML: on devices the HTML route turned signed image
// links (with &) into broken images.
test("the prompt turns into text and inline thumbnails, and back into the same text", () => {
  const { toDelta, fromDelta } = harness().service("../utils/prompt-delta");
  const assets = [image(1), video(1, "https://fixture.test/c1.jpg"), image(2)];
  const prompt = "这个@图片1 在@视频1 里跳舞，@图片9 不存在";
  const ops = plain(toDelta(prompt, assets));
  assert.deepEqual(ops, [
    { insert: "这个" },
    { insert: { image: "https://fixture.test/1.png" }, attributes: { alt: "@图片1", width: "22px", height: "22px" } },
    { insert: " 在" },
    { insert: { image: "https://fixture.test/c1.jpg" }, attributes: { alt: "@视频1", width: "22px", height: "22px" } },
    { insert: " 里跳舞，" },
    { insert: { image: "/assets/glyphs/image-muted.png" }, attributes: { alt: "@图片9", width: "22px", height: "22px" } },
    { insert: " 不存在\n" },
  ]);
  assert.equal(fromDelta(ops, assets), prompt);
  // Spaces the editor keeps as non-breaking come back as plain spaces.
  assert.equal(fromDelta([{ insert: "@图片1\u00a02个人\n" }], assets), "@图片1 2个人");
  // If the editor drops alt, the thumbnail address still identifies it;
  // a video without a cover uses the video glyph.
  assert.equal(fromDelta([{ insert: "看" }, { insert: { image: "https://fixture.test/2.png" } }, { insert: "\n" }], assets), "看@图片2");
  assert.equal(plain(toDelta("@视频1", [video(1)]))[0].insert.image, "/assets/glyphs/video-muted.png");
  assert.equal(fromDelta(plain(toDelta("＠图片1", assets)), assets), "@图片1", "a full-width ＠ becomes @");
});

test("the caret lands just after the typed character", () => {
  const { caretAfter } = harness().service("../utils/prompt-delta");
  assert.equal(caretAfter("这个美女", "这个@美女"), 3);
  assert.equal(caretAfter("", "@"), 1);
  assert.equal(caretAfter("ab", "abc"), 3);
});

function editor(h) {
  const c = h.component("components/prompt-editor"), shown = [], events = [];
  Object.assign(c.data, { value: "", assets: [], placeholder: "", max: 10 });
  c.createSelectorQuery = () => ({ select: () => ({ context: (fn) => ({ exec: () => fn({ context: { setContents: (o) => shown.push(o.delta.ops), blur() {} } }) }) }) });
  c.triggerEvent = (name, detail) => events.push([name, detail]);
  return { c, shown, events };
}

test("the editor redraws outside changes and reports typing as plain text", () => {
  const h = harness(), { c, shown, events } = editor(h);
  Object.assign(c.data, { value: "看@图片1", assets: [image(1)] });
  c.ready();
  assert.equal(shown.length, 1);
  assert.equal(JSON.parse(JSON.stringify(shown[0]))[1].attributes.alt, "@图片1");
  // Typing " 跳舞" after the thumbnail: the page receives plain text.
  c.input({ detail: { delta: { ops: [{ insert: "看" }, { insert: { image: "https://fixture.test/1.png" }, attributes: { alt: "@图片1" } }, { insert: " 跳舞\n" }] } } });
  assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))), ["input", { value: "看@图片1 跳舞", cursor: 8 }]);
  // Over the limit: the last allowed text is put back.
  c.input({ detail: { delta: { ops: [{ insert: "一二三四五六七八九十十一\n" }] } } });
  assert.equal(events.length, 1);
  assert.equal(shown.length, 2);
});
