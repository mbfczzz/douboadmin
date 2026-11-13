const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const row = (id, ratio, duration = 5, requiredImages = 1) => ({ id, data: { ratio, duration, requiredImages, title: id, cover: "" } });

test("template covers keep their shape and fill the shorter column", () => {
  const h = harness();
  const { aspect, masonry } = h.service("../pages/templates/masonry");
  assert.equal(aspect("9:16"), 1.6); // tall, capped
  assert.equal(aspect("1:1"), 1);
  assert.equal(aspect("16:9"), 0.8); // wide, raised to a readable card
  assert.equal(aspect(""), 4 / 3);
  const [left, right] = masonry([row("a", "9:16"), row("b", "1:1"), row("c", "1:1"), row("d", "3:4", 0, 0)]);
  assert.deepEqual([...left.items.map((c) => c.id)], ["a", "d"]);
  assert.deepEqual([...right.items.map((c) => c.id)], ["b", "c"]);
  assert.equal(left.items[0].coverPct, "160.0%");
  assert.equal(left.items[0].length, "5秒");
  assert.equal(left.items[0].needs, "上传 1 张照片做同款");
  assert.equal(left.items[1].length, "");
  assert.equal(left.items[1].needs, "无需照片，直接生成");
});

test("the first template is featured only under the first category without a search", () => {
  const h = harness();
  const { layout } = h.service("../pages/templates/masonry");
  const rows = [row("a", "9:16"), row("b", "1:1"), row("c", "3:4"), row("d", "1:1")];
  const featured = layout(rows, true);
  assert.equal(featured.hero.id, "a");
  assert.equal(featured.columns.flatMap((c) => c.items).length, 3);
  const plain = layout(rows, false);
  assert.equal(plain.hero, null);
  assert.equal(plain.columns.flatMap((c) => c.items).length, 4);
  // Too few templates to feature one: all stay in the waterfall.
  assert.equal(layout(rows.slice(0, 2), true).hero, null);
});

test("the featured preview plays only with autoplay on and stops when hidden", () => {
  const h = harness(),
    page = h.page("templates");
  h.api.request = async () => ({ items: [], total: 0 });
  page.onShow();
  assert.equal(page.data.heroPlay, false);
  h.storage.set("autoplay-preference", true);
  page.onShow();
  assert.equal(page.data.heroPlay, true);
  page.onHide();
  assert.equal(page.data.heroPlay, false);
});
