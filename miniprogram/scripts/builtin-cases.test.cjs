// Built-in 剧情带货 / 探店 案例: each ships its photo and cover; 做同款 puts the
// photo in as the user's own 图1 and swaps it when another case is chosen.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness } = require("./harness.cjs");

const source = fs.readFileSync(path.join(__dirname, "../pages/create/builtin-cases.ts"), "utf8");
const ids = [...source.matchAll(/id: "(case-[a-z-]+)"/g)].map((m) => m[1]);

test("every built-in case ships a small photo and cover, and its text uses the photo", () => {
  assert.equal(ids.length, 16);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids)
    for (const name of [id, `${id}-cover`]) {
      const bytes = fs.readFileSync(path.join(__dirname, "../../media/ui-art", `${name}.jpg`));
      assert.equal(bytes[0], 0xff, name);
      assert.ok(bytes.length < 160 * 1024, `${name} should be compressed`);
    }
  for (const m of source.matchAll(/prompt: "([^"]+)"/g)) assert.match(m[1], /@图片1/);
});

test("做同款 on a built-in case fills the text and its photo, swapping an earlier case's photo", async () => {
  const h = harness(), calls = [];
  h.api.request = async (p, method) => {
    calls.push(p);
    const m = /^\/cases\/([a-z-]+)\/sample$/.exec(p);
    if (m && method === "POST") return { id: "own-" + m[1], data: { url: `https://oss/${m[1]}.jpg`, type: "image/jpeg" } };
    return { items: [] };
  };
  const page = h.page("create");
  page.onLoad({ feature: "shop" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.data.featureCases[0].id, "case-shop-milktea");
  await page.openCase({ currentTarget: { dataset: { id: "case-shop-milktea" } } });
  assert.match(page.data.prompt, /@图片1中的奶茶店/);
  assert.equal(page.data.assets.map((a) => a.id).join(), "own-case-shop-milktea");
  await page.openCase({ currentTarget: { dataset: { id: "case-shop-hotpot" } } });
  assert.equal(page.data.assets.map((a) => a.id).join(), "own-case-shop-hotpot");
  // A picture of the user's own stays; only the text changes.
  page.setData({ assets: [{ id: "mine", isImage: true, data: { type: "image/jpeg", url: "https://u/1.jpg" } }] });
  const asked = calls.length;
  await page.openCase({ currentTarget: { dataset: { id: "case-shop-cafe" } } });
  assert.equal(calls.length, asked);
  assert.equal(page.data.assets.map((a) => a.id).join(), "mine");
  assert.match(page.data.prompt, /咖啡馆/);
});
