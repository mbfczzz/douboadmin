const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");
const image = (i) => ({ id: `img-${i}`, isImage: true, data: { url: `https://fixture.test/${i}.png`, type: "image/png" } });
const input = (page, value, cursor = value.length) => page.input({ detail: { value, cursor } });
const styles = (text) => Object.fromEntries(text.split(";").map((entry) => { const [key, value] = entry.split(":"); return [key, parseFloat(value)]; }));

test("inline picker replaces the bottom popup and supports native text input layering", () => {
  const template = fs.readFileSync("pages/create/parts/mention.wxml", "utf8");
  const sheets = fs.readFileSync("pages/create/parts/sheets.wxml", "utf8");
  const editor = fs.readFileSync("pages/create/index.wxml", "utf8");
  assert.match(template, /<cover-view[^>]+class="mention-popover"/);
  assert.match(template, /<cover-image/);
  assert.doesNotMatch(sheets, /t-popup[^>]+mentionOpen/);
  assert.match(editor, /hold-keyboard="{{mentionOpen}}"/);
  assert.match(editor, /disable-default-padding/);
});

test("the picker stays beside @ and within narrow screens above the keyboard", () => {
  const h = harness(), { mentionPosition } = h.service("../pages/create/mention-position");
  for (const width of [320, 390, 430]) for (const bottom of [330, 500, 700]) {
    for (const x of [36, width - 50]) for (const y of [160, bottom - 40]) {
      const result = styles(mentionPosition({ left: x, right: x + 14, top: y, bottom: y + 22 }, { left: 24, right: width - 24, top: 100, bottom: bottom - 10 }, width, bottom, 12));
      assert.ok(result.left >= 12);
      assert.ok(result.left + result.width <= width - 12);
      assert.ok(result.top >= 8);
      assert.ok(result.top + result["max-height"] <= bottom - 8);
    }
  }
  const beside = styles(mentionPosition({ left: 60, right: 74, top: 200, bottom: 222 }, { left: 24, right: 366, top: 160, bottom: 248 }, 390, 500, 1));
  assert.equal(beside.left, 82);
  assert.equal(beside.top, 200);
  assert.equal(beside["max-height"], 98);
});

test("continue typing dismisses stale choices and a subsequent @ uses the new cursor", () => {
  const h = harness(), page = h.page("create");
  page.setData({ assets: [image(1), image(2)] });
  input(page, "把@", 2);
  assert.equal(page.data.mentionOpen, true);
  assert.equal(page.data.mentionPrefix, "把");
  input(page, "把@改成红色");
  assert.equal(page.data.mentionOpen, false);
  input(page, "把@改成红色，参考@");
  page.blurPrompt();
  page.pickMention({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(page.data.prompt, "把@改成红色，参考@图片2 ");
  assert.equal(page.data.promptFocus, true);
  assert.equal(page.data.promptCursor, page.data.prompt.length);
});

test("delayed layout callbacks cannot reopen a canceled or hidden picker", () => {
  const h = harness(), page = h.page("create");
  let measured;
  const query = { select() { return this; }, boundingClientRect() { return this; }, exec(callback) { measured = callback; } };
  h.wx.createSelectorQuery = () => query;
  page.setData({ assets: [image(1)] });
  input(page, "@");
  page.closeMention();
  measured([{ left: 60, right: 70, top: 200, bottom: 222 }, { left: 24, right: 366, top: 160, bottom: 248 }]);
  assert.equal(page.data.mentionOpen, false);
  assert.equal(page.data.mentionReady, false);
  input(page, "再@");
  page.onHide();
  measured([{ left: 60, right: 70, top: 200, bottom: 222 }, { left: 24, right: 366, top: 160, bottom: 248 }]);
  assert.equal(page.data.mentionReady, false);
});

test("closing the keyboard cancels the picker without changing the prompt", () => {
  const h = harness(), page = h.page("create");
  page.setData({ assets: [image(1)] });
  input(page, "人物@");
  page.promptKeyboard({ detail: { height: 320 } });
  assert.equal(page.data.keyboardHeight, 320);
  page.promptKeyboard({ detail: { height: 0 } });
  assert.equal(page.data.mentionOpen, false);
  assert.equal(page.data.prompt, "人物@");
});
