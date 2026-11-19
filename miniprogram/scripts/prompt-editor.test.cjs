const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const image = (n) => ({ id: "img" + n, isImage: true, data: { url: "https://fixture.test/" + n + ".png" } });
const video = (n, cover = "") => ({ id: "vid" + n, isImage: false, isVideo: true, data: { url: "https://fixture.test/v" + n, thumbnailUrl: cover } });
const plain = (ops) => JSON.parse(JSON.stringify(ops));

test("the prompt draws as text with rounded inline thumbnails and reads back as the same text", () => {
  const { toHtml, fromDelta } = harness().service("../utils/prompt-delta");
  const assets = [image(1), video(1, "https://fixture.test/c1.jpg?a=1&b=2"), image(2)];
  const html = toHtml("这个@图片1 在@视频1 里<跳舞>\n@图片9 不存在", assets);
  assert.match(html, /^<p>这个<img src="https:\/\/fixture\.test\/1\.png" alt="@图片1" style="[^"]*border-radius:6px[^"]*">&nbsp;在<img src="https:\/\/fixture\.test\/c1\.jpg\?a=1&amp;b=2" alt="@视频1"/);
  assert.match(html, /里&lt;跳舞&gt;<\/p><p>@图片9&nbsp;不存在<\/p>$/);
  assert.equal(toHtml("", assets), "<p><br></p>");
  assert.match(toHtml("@视频1", [video(1)]), /src="\/assets\/glyphs\/video-muted\.png"/);
  // The editor reports images back in its delta; alt restores the text, and
  // without alt the address still identifies the reference.
  const ops = [{ insert: "这个" }, { insert: { image: "https://fixture.test/1.png" }, attributes: { alt: "@图片1" } }, { insert: " 在" },
    { insert: { image: "https://fixture.test/c1.jpg?a=1&b=2" } }, { insert: " 里跳舞\n" }];
  assert.equal(fromDelta(ops, assets), "这个@图片1 在@视频1 里跳舞");
  // Spaces the editor keeps as non-breaking come back as plain spaces.
  assert.equal(fromDelta([{ insert: "@图片1\u00a02个人\n" }], assets), "@图片1 2个人");
  assert.match(toHtml("＠图片1", assets), /alt="@图片1"/, "a full-width ＠ becomes @");
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
  c.createSelectorQuery = () => ({ select: () => ({ context: (fn) => ({ exec: () => fn({ context: { setContents: (o) => shown.push(o.html), blur() {} } }) }) }) });
  c.triggerEvent = (name, detail) => events.push([name, detail]);
  return { c, shown, events };
}

test("the editor redraws outside changes and reports typing as plain text", () => {
  const h = harness(), { c, shown, events } = editor(h);
  Object.assign(c.data, { value: "看@图片1", assets: [image(1)] });
  c.ready();
  assert.equal(shown.length, 1);
  assert.match(shown[0], /^<p>看<img [^>]*alt="@图片1"/);
  // Typing " 跳舞" after the thumbnail: the page receives plain text.
  c.input({ detail: { delta: { ops: [{ insert: "看" }, { insert: { image: "https://fixture.test/1.png" }, attributes: { alt: "@图片1" } }, { insert: " 跳舞\n" }] } } });
  assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))), ["input", { value: "看@图片1 跳舞", cursor: 8 }]);
  // Over the limit: the last allowed text is put back.
  c.input({ detail: { delta: { ops: [{ insert: "一二三四五六七八九十十一\n" }] } } });
  assert.equal(events.length, 1);
  assert.equal(shown.length, 2);
});
