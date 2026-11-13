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

test("typing @ opens a thumbnail sheet and inserts the picked image at the cursor", () => {
  const h = harness(),
    page = h.page("create");
  page.setData({
    assets: [
      image(1),
      { id: "video", isImage: false, data: { type: "video/mp4" } },
      image(2),
    ],
    prompt: "",
    maxPromptChars: 500,
  });
  page.input(event("参考@保持人物", 3));
  assert.equal(page.data.mentionOpen, true);
  assert.deepEqual(
    page.data.mentionItems.map((m) => [m.id, m.label, m.url]),
    [
      ["image-1", "图片1", "https://fixture.test/1"],
      ["image-2", "图片2", "https://fixture.test/2"],
    ],
  );
  pick(page, 1);
  assert.equal(page.data.mentionOpen, false);
  assert.equal(page.data.prompt, "参考@图片2 保持人物");
  assert.equal(page.data.promptCursor, 7);
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
  page.setData({assets:[image(1),image(2)],prompt:"让 @图片1 与 @图片2 同框",promptCursor:15});
  page.clearReferences();
  assert.equal(page.data.prompt,"让  与  同框");
  assert.equal(page.data.hasPrompt,true);
  assert.equal(page.data.assets.length,0);
  assert.equal(page.data.promptCursor,-1);
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
