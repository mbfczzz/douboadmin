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

test("the server writes 生成同款 from the swaps; the editor's brief puts the pictures into the shots", async () => {
  const h = harness();
  const { remakeInstruction } = h.service("../pages/create/remake-brief");
  const breakdown = { subjects, summary: "", hook: "回眸", structure: "", sellingPoints: [], style: "", music: "", shots: [{ start: 0, end: 3, scene: "窗边", action: "回头", camera: "", speech: "" }] };
  const swaps = [
    { name: "主角", kind: "person", look: "长发女生", ref: "@图片1" },
    { name: "保温杯", kind: "product", look: "白色", ref: "@图片2" },
  ];
  const brief = remakeInstruction({ title: "t", text: "", duration: 10, breakdown, images: 2, swaps }, 10, 800);
  assert.match(brief, /用户指定了替换：把【主角（长发女生）】换成@图片1中的人物/);
  assert.match(brief, /分镜里凡是出现被替换的主体，都直接写成对应图片中的人物或商品/);
  assert.doesNotMatch(brief, /保持原视频的样子/);
  await h.api.signIn();
  const posts = [];
  h.wx.request = (o) => { posts.push(o); o.success({ statusCode: 200, data: { prompt: "描述" } }); };
  const { remakeBrief } = h.service("hot-import");
  assert.equal((await remakeBrief("job-1", 10, 2000, 2, swaps)).prompt, "描述");
  const sent = posts.find((p) => p.url.endsWith("/remake/prompt"));
  assert.deepEqual(plain(sent.data), { job: "job-1", seconds: 10, limit: 2000, images: 2, swaps: [{ name: "主角", picture: 1 }, { name: "保温杯", picture: 2 }] });
});

test("keeping the main person while swapping others warns the remake will look like the original", () => {
  const { mainKept } = harness().service("../pages/task-detail/swap");
  const rows = (...picks) => subjects.map((s, i) => ({ ...s, pick: picks[i] || "" }));
  assert.equal(mainKept(rows()), "", "nothing swapped: nothing to warn about");
  assert.equal(mainKept(rows("", "", "p1")), "主角");
  assert.equal(mainKept(rows("p1", "", "p2")), "");
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
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["cup"]);
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

test("a remake without its breakdown says so and can be broken down again", async () => {
  const h = harness(), messages = [], posts = [];
  await h.api.signIn();
  h.wx.showToast = (o) => messages.push(o.title);
  const page = h.page("task-detail");
  h.wx.request = (o) => o.success({ statusCode: 200, data: { status: "failed", result: null } });
  page.setData({ job: { id: "j", status: "succeeded", resultAssetId: "orig", input: { purpose: "remake", sourceId: "7301", assets: [] } } });
  await page.loadSwaps();
  assert.equal(page.data.breakdownMissing, true);
  // Failing again is said, and the button comes back.
  await page.retryBreakdown();
  assert.match(messages.at(-1), /还是没有拆解成功/);
  assert.equal(page.data.rebreaking, false);
  h.wx.request = (o) => { posts.push(o); o.success({ statusCode: 200, data: { status: "done", result: { subjects, shots: [{ start: 0, end: 3, scene: "窗边" }] } } }); };
  await page.retryBreakdown();
  assert.deepEqual(plain(posts[0].data), { assetId: "orig" });
  assert.ok(posts[0].url.endsWith("/hot/videos/7301/breakdown"));
  assert.equal(page.data.breakdownMissing, false);
  assert.deepEqual(plain(page.data.swaps.map((r) => r.name)), ["主角", "背景店铺", "保温杯"]);
  page.onUnload && page.onUnload();
});

test("a breakdown not read for the network is said so and read again, not taken for a failed one", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("task-detail");
  h.wx.request = (o) => o.fail({ errMsg: "request:fail timeout" });
  page.setData({ job: { id: "j", status: "succeeded", resultAssetId: "orig", input: { purpose: "remake", sourceId: "7301", assets: [] } } });
  await page.loadSwaps();
  assert.equal(page.data.swapLoaded, true, "生成同款 still works: the server reads it");
  assert.equal(page.data.breakdownUnread, true);
  assert.equal(page.data.breakdownMissing, false);
  h.wx.request = (o) => o.success({ statusCode: 200, data: { status: "done", result: { subjects, shots: [{ start: 0, end: 3, scene: "窗边" }] } } });
  page.reloadSwaps();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.equal(page.data.breakdownUnread, false);
  assert.deepEqual(plain(page.data.swaps.map((r) => r.name)), ["主角", "背景店铺", "保温杯"]);
  // None at all (404) is a missing breakdown, offered 重新拆解.
  const fresh = harness();
  await fresh.api.signIn();
  const other = fresh.page("task-detail");
  fresh.wx.request = (o) => o.success({ statusCode: 404, data: { error: "这条视频还没有拆解" } });
  other.setData({ job: { id: "j", status: "succeeded", resultAssetId: "orig", input: { purpose: "remake", sourceId: "7301", assets: [] } } });
  await other.loadSwaps();
  assert.equal(other.data.breakdownMissing, true);
  assert.equal(other.data.breakdownUnread, false);
});

test("the editor's brief shows on-screen words apart from lines, never as lines", () => {
  const { remakeInstruction } = harness().service("../pages/create/remake-brief");
  const breakdown = { subjects, summary: "", hook: "", structure: "", sellingPoints: [], style: "", music: "",
    shots: [{ start: 0, end: 3, scene: "窗边", action: "回头", camera: "", speech: "早上好", caption: "第一天打卡" }] };
  const brief = remakeInstruction({ title: "t", text: "", duration: 3, breakdown }, 3, 800);
  assert.match(brief, /台词\/口播：早上好｜画面文字：第一天打卡/);
  assert.match(brief, /「画面文字」只作内容参考，不写成台词/);
});
