const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

const video = (id) => ({ id, title: "视频" + id, text: "", author: "作者", cover: "https://c/" + id, url: "", sourceUrl: "", likes: 12000, views: null, comments: null, publishedAt: "2026-11-01T00:00:00Z", duration: 10 });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function studio(signedIn = true) {
  const h = harness(), calls = [];
  h.api.hasSession = () => signedIn;
  h.api.request = async (path) => {
    if (path.startsWith("/hot")) calls.push(path);
    if (path.startsWith("/hot/discovery")) return { enabled: true, keywords: ["剧情带货", "探店", "美食"], source: "创作关键词" };
    if (!path.includes("?")) return video(path.split("/").pop());
    const cursor = Number(/cursor=(\d+)/.exec(path)[1]);
    return { items: [video("a" + cursor), video("b" + cursor)], cursor: cursor + 2, hasMore: cursor === 0, searchId: "s", backtrace: "" };
  };
  h.api.tab = () => undefined;
  return { h, calls, page: h.page("studio") };
}

test("创作 is a tab page of entry cards; the editor and 混剪 are subpages", () => {
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  const tabs = app.tabBar.list.map((item) => item.pagePath);
  assert.ok(tabs.includes("pages/studio/index"));
  assert.ok(!tabs.includes("pages/create/index") && !tabs.includes("pages/mix/index"));
  const { h, page } = studio();
  const open = (key) => { page.open({ currentTarget: { dataset: { key } } }); h.api.resetNavigation(page); };
  for (const key of ["video", "image", "mix", "remake", "ad", "idphoto", "extract", "remix", "tryon"]) open(key);
  assert.deepEqual(h.nav.map((n) => n.url), ["/pages/create/index?kind=video", "/pages/create/index?kind=image", "/pages/mix/index", "/pages/remake/index", "/pages/create/index?feature=ad", "/pages/create/index?feature=idphoto", "/pages/extract/index", "/pages/feature/index?key=remix", "/pages/tryon/index"]);
});

test("the feed lists the first keyword's videos without saving search history", async () => {
  const { calls, page } = studio();
  page.onShow();
  await settle();
  // The server's creative feed keywords (words=0), not Douyin's news hot words.
  assert.equal(calls[0], "/hot/discovery?words=0");
  assert.deepEqual(Array.from(page.data.keywords).slice(0, 3), ["剧情带货", "探店", "美食"]);
  assert.equal(page.data.keyword, "剧情带货");
  assert.match(calls[1], /^\/hot\/videos\?q=%E5%89%A7%E6%83%85%E5%B8%A6%E8%B4%A7&cursor=0.*&history=0$/);
  assert.deepEqual(Array.from(page.data.videos, (v) => v.id), ["a0", "b0"]);
  assert.equal(page.data.videos[0].likesText, "1.2万");
  page.onReachBottom();
  await settle();
  assert.deepEqual(Array.from(page.data.videos, (v) => v.id), ["a0", "b0", "a2", "b2"]);
  assert.equal(page.data.hasMore, false);
  page.choose({ currentTarget: { dataset: { word: "美食" } } });
  await settle();
  assert.equal(page.data.keyword, "美食");
  assert.deepEqual(Array.from(page.data.videos, (v) => v.id), ["a0", "b0"]);
});

test("a visitor sees the keywords with a sign-in prompt, not a failed search", async () => {
  const { calls, page } = studio(false);
  page.onShow();
  await settle();
  assert.equal(page.data.feedState, "login");
  assert.deepEqual(calls, ["/hot/discovery?words=0"]);
});

test("做同款 opens 一键复刻; starting queues the preparation task and opens it", async () => {
  const { h, page } = studio();
  page.remake({ currentTarget: { dataset: { id: "v1" } } });
  assert.equal(h.nav[0].url, "/pages/remake/index?id=v1");
  const remake = h.page("remake"), started = [];
  h.service("hot-import").startRemake = async (id, original, pictures) => { started.push([id, original.title, Array.from(pictures)]); return { id: "job-9" }; };
  remake.onLoad({ id: "v1" });
  remake.onShow();
  await settle();
  assert.equal(remake.data.video.id, "v1");
  remake.setData({ pictures: [{ id: "pic-1", url: "u" }] });
  await remake.start();
  assert.deepEqual(started, [["v1", "视频v1", ["pic-1"]]]);
  assert.equal(h.nav[1].url, "/pages/task-detail/index?id=job-9");
  assert.equal(remake.data.busy, false);
});

test("a finished 一键复刻 task hands video, pictures and breakdown to the editor", async () => {
  const h = harness(), calls = [];
  const { startRemake, remakeHandoff, remakeOriginal } = h.service("hot-import");
  h.service("request").request = async (path, method, body, key) => { calls.push([path, method, body, !!key]); return { id: "job-1" }; };
  await startRemake("7301", { title: "开箱口红", text: "黄皮也能涂", duration: 17.6 }, ["pic-1"]);
  assert.deepEqual(calls[0].slice(0, 2), ["/hot/videos/7301/import", "POST"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), { purpose: "remake", assets: ["pic-1"], title: "开箱口红", text: "黄皮也能涂", duration: 18 });
  assert.equal(calls[0][3], true, "idempotency key");
  const job = { id: "job-1", resultAssetId: "asset-1", input: { kind: "import", purpose: "remake", sourceId: "7301", prompt: "一键复刻：开箱口红\n黄皮也能涂", duration: 18, assets: ["pic-1", "pic-2"] } };
  assert.deepEqual(JSON.parse(JSON.stringify(remakeOriginal(job))), { title: "开箱口红", text: "黄皮也能涂", duration: 18 });
  remakeHandoff(job, { hook: "撕快递", shots: [] });
  const source = h.storage.get("remake-source"), draft = h.storage.get("edit-draft");
  assert.equal(source.breakdown.hook, "撕快递");
  assert.equal(source.images, 2);
  assert.deepEqual(Array.from(draft.assets), ["asset-1", "pic-1", "pic-2"]);
  assert.match(draft.prompt, /^参考@视频1[^]*换成@图片1、@图片2中的商品或人物[^]*视频主题：开箱口红$/);
  assert.equal(draft.duration, 18);
});

test("生成同款 picks a fitting model, writes from the breakdown and submits after one confirmation", async () => {
  const h = harness(), submitted = [];
  h.service("hot-breakdown").readBreakdown = async () => ({ hook: "撕快递", style: "手持暖光", shots: [{ start: 0, end: 6, scene: "卧室", action: "撕开快递", camera: "手持", speech: "终于到了" }, { start: 6, end: 18, scene: "镜前", action: "试色", camera: "特写", speech: "" }] });
  const video = (id, refs) => ({ id, kind: "video", name: id, referenceTypes: refs, modes: ["t2v", "omni_ref"], durations: [5, 10, 15], resolutions: ["480p", "720p"], ratios: ["9:16", "16:9"], settings: {} });
  h.service("../utils/config-cache").loadConfig = async () => ({ models: [video("text-only", []), video("video-only", ["video"]), video("both", ["image", "video"])] });
  h.api.submitInput = async (input, channel) => { submitted.push([input, channel]); return { id: "gen-1", input, status: "queued" }; };
  const detail = h.page("task-detail");
  detail.setData({ job: { id: "job-1", status: "succeeded", resultAssetId: "asset-1", input: { kind: "import", purpose: "remake", sourceId: "7301", prompt: "一键复刻：开箱口红", duration: 18, assets: ["pic-1"] } } });
  await detail.generateRemake();
  const [input, channel] = submitted[0];
  assert.equal(channel, "remake");
  assert.equal(input.model, "both", "a model taking the video and the picture");
  assert.equal(input.duration, 15);
  assert.equal(input.mode, "omni_ref");
  assert.deepEqual(Array.from(input.assets), ["asset-1", "pic-1"]);
  assert.match(input.prompt, /^参考@视频1[^]*15 秒的同款视频[^]*换成@图片1[^]*开头 3 秒保留钩子：撕快递[^]*\n0–5秒：卧室，撕开快递，手持，台词“终于到了”\n5–15秒：镜前，试色，特写$/);
  assert.equal(h.nav[0].url, "/pages/task-detail/index?id=gen-1");
  assert.equal(detail.data.busy, false);
});

test("调整后再生成 still opens the editor preset; labels say 一键复刻", async () => {
  const h = harness();
  h.service("hot-breakdown").readBreakdown = async (id) => (id === "7301" ? { hook: "钩子", shots: [] } : null);
  const detail = h.page("task-detail");
  detail.setData({ job: { id: "job-1", status: "succeeded", resultAssetId: "asset-1", input: { kind: "import", purpose: "remake", sourceId: "7301", prompt: "一键复刻：标题", duration: 10, assets: [] } } });
  await detail.editRemake();
  assert.equal(h.storage.get("remake-source").breakdown.hook, "钩子");
  assert.equal(h.nav[0].url, "/pages/create/index?feature=remake");
  const { jobView } = h.api;
  const remake = jobView({ ...detail.data.job, createdAt: "2026-11-20T00:00:00Z", input: { ...detail.data.job.input, prompt: "一键复刻：标题\n文案" } });
  assert.equal(remake.kindText, "一键复刻");
  assert.equal(remake.stateText, "已就绪");
  assert.equal(remake.shortTitle, "一键复刻：标题");
  assert.equal(jobView({ id: "x", status: "running", createdAt: "2026-11-20T00:00:00Z", input: { kind: "import", prompt: "导入抖音视频素材", assets: [] } }).kindText, "素材导入");
});

test("一键复刻 also reads a pasted Douyin link", async () => {
  const h = harness(), calls = [];
  h.api.request = async (path, method, body) => { calls.push([path, method, body && body.text]); return { id: "7301", title: "标题", text: "", author: "作者", cover: "", url: "", sourceUrl: "", likes: null, views: null, comments: null, publishedAt: "2026-11-01T00:00:00Z", duration: 12 }; };
  const remake = h.page("remake");
  remake.onLoad({});
  remake.onShow();
  assert.equal(calls.length, 0);
  remake.input({ detail: { value: "复制打开抖音 https://v.douyin.com/abc/" } });
  remake.readLink();
  await settle();
  assert.deepEqual(calls[0], ["/hot/link", "POST", "复制打开抖音 https://v.douyin.com/abc/"]);
  assert.equal(remake.data.video.id, "7301");
  assert.equal(remake.data.seconds, 12);
  assert.equal(remake.data.tooLong, false);
  remake.change();
  assert.equal(remake.data.video, null);
});

test("图片创作 opens the editor on images", () => {
  const h = harness(), editor = h.page("create");
  editor.onLoad({ kind: "image" });
  assert.equal(editor.data.kind, "image");
  assert.equal(editor.data.ratio, "1:1");
});
