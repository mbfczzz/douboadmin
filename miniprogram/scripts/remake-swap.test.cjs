const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// 一键复刻: each of the user's pictures replaces a named subject of the
// original, written out in the description, instead of the video model guessing.
const plain = (v) => JSON.parse(JSON.stringify(v));
const subjects = [
  { name: "主角", kind: "person", look: "长发女生", when: "0-8秒" },
  { name: "背景店铺", kind: "other", look: "咖啡店", when: "" },
  { name: "保温杯", kind: "product", look: "白色", when: "3-12秒" },
];

test("a first guess gives people and products the pictures in order; others stay", () => {
  const { firstGuess } = harness().service("../pages/task-detail/swap");
  assert.deepEqual(plain(firstGuess(subjects, ["p1", "p2"]).map((r) => r.pick)), ["p1", "", "p2"]);
  assert.deepEqual(plain(firstGuess(subjects, ["p1"]).map((r) => r.pick)), ["p1", "", ""]);
});

test("only chosen pictures go, numbered by the swaps that use them", () => {
  const { chosenSwaps } = harness().service("../pages/task-detail/swap");
  const rows = [
    { ...subjects[0], pick: "p3" },
    { ...subjects[1], pick: "" },
    { ...subjects[2], pick: "p1" },
  ];
  const out = plain(chosenSwaps(rows));
  assert.deepEqual(out.pictures, ["p3", "p1"]);
  assert.deepEqual(out.swaps.map((s) => [s.name, s.ref]), [["主角", "@图片1"], ["保温杯", "@图片2"]]);
});

test("the description names each swap; nothing is left to guess", () => {
  const h = harness();
  const { remakePrompt, remakeInstruction } = h.service("../pages/create/remake-brief");
  const breakdown = { subjects, summary: "", hook: "回眸", structure: "", sellingPoints: [], style: "", music: "", shots: [{ start: 0, end: 3, scene: "窗边", action: "回头", camera: "", speech: "" }] };
  const swaps = [
    { name: "主角", kind: "person", look: "长发女生", ref: "@图片1" },
    { name: "保温杯", kind: "product", look: "白色", ref: "@图片2" },
  ];
  const prompt = remakePrompt({ title: "t", text: "", duration: 10, breakdown, images: 2, swaps }, 10, 2000);
  assert.match(prompt, /把【主角（长发女生）】换成@图片1中的人物；把【保温杯（白色）】换成@图片2中的商品/);
  assert.match(prompt, /其他主体保持原样/);
  assert.match(remakeInstruction({ title: "t", text: "", duration: 10, breakdown, images: 2, swaps }, 10, 800), /用户指定了替换：把【主角/);
  // Without matches (an older breakdown), all pictures with the general wording.
  assert.match(remakePrompt({ title: "t", text: "", duration: 10, breakdown, images: 2 }, 10, 2000), /换成@图片1、@图片2中的商品或人物/);
});

test("each subject has its own slot: upload replaces it, × keeps the original; no pictures needed first", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  h.wx.request = (o) => o.success({ statusCode: 200, data: { status: "done", result: { subjects, shots: [] } } });
  // A remake started without pictures still lists its subjects, all 原样.
  page.setData({ job: { id: "j", status: "succeeded", input: { purpose: "remake", sourceId: "7301", assets: [] } } });
  await page.loadSwaps();
  assert.deepEqual(plain(page.data.swaps.map((r) => r.pick)), ["", "", ""]);
  h.api.chooseReferenceFile = async () => ({ path: "tmp/cup.jpg" });
  h.api.upload = async () => ({ id: "cup", data: { url: "https://oss/cup.jpg", type: "image/jpeg" } });
  await page.uploadSwap({ currentTarget: { dataset: { index: 2 } } });
  assert.deepEqual(plain(page.data.swaps.map((r) => r.pick)), ["", "", "cup"]);
  assert.equal(page.data.swapUrls.cup, "https://oss/cup.jpg");
  assert.equal(page.data.swapUploading, -1);
  page.clearSwap({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(page.data.swaps[2].pick, "");
  page.onUnload && page.onUnload();
});

test("pictures given with an older remake are the first guess, shown in their slots", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  h.wx.request = (o) => o.success({ statusCode: 200, data: { status: "done", result: { subjects, shots: [] } } });
  page.setData({
    assets: [{ id: "p1", isImage: true, data: { url: "https://oss/p1.jpg" } }, { id: "p2", isImage: true, data: { url: "https://oss/p2.jpg" } }],
    job: { id: "j", status: "succeeded", input: { purpose: "remake", sourceId: "7301", assets: ["p1", "p2"] } },
  });
  await page.loadSwaps();
  assert.deepEqual(plain(page.data.swaps.map((r) => r.pick)), ["p1", "", "p2"]);
  assert.equal(page.data.swapUrls.p2, "https://oss/p2.jpg");
  page.onUnload && page.onUnload();
});
