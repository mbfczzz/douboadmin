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

test("the task page loads the subjects and a tap changes or clears a match", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  h.wx.request = (o) => o.success({ statusCode: 200, data: { status: "done", result: { subjects, shots: [] } } });
  page.setData({ job: { id: "j", status: "succeeded", input: { purpose: "remake", sourceId: "7301", assets: ["p1", "p2"] } } });
  await page.loadSwaps();
  assert.deepEqual(plain(page.data.swaps.map((r) => r.pick)), ["p1", "", "p2"]);
  page.pickSwap({ currentTarget: { dataset: { index: 0, id: "p2" } } });
  page.pickSwap({ currentTarget: { dataset: { index: 2, id: "" } } }); // 原样
  assert.deepEqual(plain(page.data.swaps.map((r) => r.pick)), ["p2", "", ""]);
  page.pickSwap({ currentTarget: { dataset: { index: 0, id: "p2" } } }); // tapping the chosen one again keeps the original
  assert.equal(page.data.swaps[0].pick, "");
  page.onUnload && page.onUnload();
});
