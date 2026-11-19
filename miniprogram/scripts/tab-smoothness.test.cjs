const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const work = (id) => ({ id, title: id, kind: "image", result: "https://fixture.test/" + id + ".png", results: [], createdAt: "2026-11-15T00:00:00Z" });

// Coming back to a 优秀 filter seen this session shows it at once, no skeleton.
test("featured works repaint a filter seen this session before the network answers", async () => {
  const h = harness(), service = h.service("featured-works"), c = h.component("components/featured-works");
  c.self().visible = true;
  service.featuredPage = async (_, kind) => ({ items: [work(kind || "all")], total: 1 });
  await c.load();
  c.choose({ currentTarget: { dataset: { kind: "image" } } });
  await new Promise(setImmediate);
  let release;
  service.featuredPage = () => new Promise((done) => { release = done; });
  c.choose({ currentTarget: { dataset: { kind: "" } } });
  assert.equal(c.data.works[0].id, "all", "cached list shown while loading");
  release({ items: [work("fresh")], total: 1 });
  await new Promise(setImmediate);
  assert.equal(c.data.works[0].id, "fresh");
});

// 模板 ⇄ 优秀 share one page; each view returns to where it was scrolled.
test("switching 模板 and 优秀 restores each view's scroll position", () => {
  const h = harness(), mode = h.service("../utils/featured-mode"), page = h.page("templates");
  let scrollTop = 900;
  const scrolls = [];
  h.wx.createSelectorQuery = () => {
    const q = { selectViewport: () => q, scrollOffset: (fn) => ((q.fn = fn), q), exec: () => q.fn({ scrollTop }) };
    return q;
  };
  h.wx.pageScrollTo = (o) => { scrolls.push(o.scrollTop); scrollTop = o.scrollTop; };
  page.onLoad();
  mode.setFeatured(true);
  page.applyTabView();
  assert.deepEqual(scrolls, [0], "优秀 opens at its top");
  scrollTop = 300;
  mode.setFeatured(false);
  page.applyTabView();
  assert.deepEqual(scrolls, [0, 900], "模板 returns to where the list was");
  mode.setFeatured(true);
  page.applyTabView();
  assert.deepEqual(scrolls, [0, 900, 300]);
});

// Back from the share sheet keeps the work; a first load cut short by
// leaving is retried on return.
test("share page loads once, and retries only a load cut short by leaving", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("share");
  const pending = [];
  h.api.request = () => new Promise((done) => pending.push(done));
  const job = { id: "j", status: "succeeded", result: "https://cdn.test/v.mp4", input: { kind: "video", prompt: "" } };
  page.onLoad({ id: "j" });
  page.onShow();
  page.onHide(); // share sheet opened before the answer
  pending[0](job);
  await new Promise(setImmediate);
  page.onShow();
  assert.equal(pending.length, 2, "the cut-short load is retried");
  pending[1](job);
  await new Promise(setImmediate);
  assert.equal(page.data.job.id, "j");
  page.onHide();
  page.onShow();
  assert.equal(pending.length, 2, "a loaded page does not reload on return");
});
