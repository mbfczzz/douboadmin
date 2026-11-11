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

test("typing @ selects an uploaded image at the cursor without losing following text", () => {
  const h = harness(),
    page = h.page("create");
  let sheet;
  h.wx.showActionSheet = (o) => (sheet = o);
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
  assert.equal(sheet.itemList.length, 2);
  sheet.success({ tapIndex: 1 });
  assert.equal(page.data.prompt, "参考@图片2 保持人物");
  assert.equal(page.data.promptCursor, 7);
  assert.equal(page.data.assets.length, 3);
});

test("all uploaded images are reachable through the native list and stale choice is discarded", () => {
  const h = harness(),
    page = h.page("create"),
    sheets = [];
  h.wx.showActionSheet = (o) => sheets.push(o);
  page.setData({
    assets: Array.from({ length: 12 }, (_, i) => image(i)),
    maxPromptChars: 500,
  });
  page.input(event("@"));
  assert.equal(sheets[0].itemList.length, 6);
  sheets[0].success({ tapIndex: 5 });
  sheets[1].success({ tapIndex: 5 });
  assert.match(sheets[2].itemList[0], /图片11/);
  sheets[2].success({ tapIndex: 1 });
  assert.equal(page.data.prompt, "@图片12 ");
  page.input(event("@"));
  page.setData({ prompt: "已修改" });
  sheets.at(-1).success({ tapIndex: 0 });
  assert.equal(page.data.prompt, "已修改");
});

test("cancel, missing images, prompt limits and page hide preserve the draft", () => {
  const h = harness(),
    page = h.page("create");
  let sheet,
    toasts = 0;
  h.wx.showActionSheet = (o) => (sheet = o);
  h.wx.showToast = () => toasts++;
  page.input(event("@"));
  assert.equal(toasts, 1);
  assert.equal(sheet, undefined);
  page.setData({ assets: [image(1)], maxPromptChars: 2 });
  page.input(event("@"));
  sheet.success({ tapIndex: 0 });
  assert.equal(page.data.prompt, "@");
  assert.equal(toasts, 2);
  page.setData({ maxPromptChars: 500 });
  page.input(event("@"));
  sheet.fail({ errMsg: "cancel" });
  assert.equal(page.data.prompt, "@");
  page.input(event("@"));
  page.visible = false;
  sheet.success({ tapIndex: 0 });
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

test("a cancelled old mention sheet cannot change the draft or unlock a new sheet",()=>{
  const h=harness(),page=h.page("create"),sheets=[];
  h.wx.showActionSheet=o=>sheets.push(o);
  page.setData({assets:[image(1)],maxPromptChars:500});
  page.input(event("@"));
  page.onHide();page.visible=true;
  page.input(event("@"));
  assert.equal(sheets.length,2);
  sheets[0].success({tapIndex:0});
  sheets[0].fail({errMsg:"old failure"});
  page.input(event("@"));
  assert.equal(sheets.length,2);
  sheets[1].success({tapIndex:0});
  assert.equal(page.data.prompt,"@图片1 ");
});
