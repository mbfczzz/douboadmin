const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// Interface-first feature pages (pages/feature): fill-in examples.
test("视频唱歌 and 数字人 offer examples that fill what the user would give; 视频二创 has no hot-video strip", async () => {
  // 视频唱歌: a sample face photo fills the upload.
  const h = harness();
  h.api.request = async (p) => (p === "/config" ? { models: [], uiArt: {} } : {});
  const sing = h.page("feature");
  sing.onLoad({ key: "sing" });
  sing.setData({ art: { sampleFace1: "https://oss/face-1.jpg" } });
  const up = sing.data.sections.findIndex((s) => s.type === "upload");
  assert.equal(sing.data.sections[up].samples.length, 3);
  sing.sample({ currentTarget: { dataset: { section: up, index: 0 } } });
  assert.equal(sing.data.sections[up].file.url, "https://oss/face-1.jpg");
  assert.equal(sing.data.sections[up].file.sample, true);
  assert.equal(sing.missing(), "");
  // 数字人: text examples fill the 口播文案.
  const avatar = harness().page("feature");
  avatar.onLoad({ key: "avatar" });
  const ex = avatar.data.sections.findIndex((s) => s.type === "examples");
  avatar.example({ currentTarget: { dataset: { section: ex, index: 1 } } });
  assert.match(avatar.data.sections.find((s) => s.type === "text").value, /保温杯/);
  // 视频二创: no hot-video strip under the link box.
  const remix = harness().page("feature");
  remix.onLoad({ key: "remix" });
  assert.ok(!remix.data.sections.some((s) => s.type === "hotlinks"));
});

test("视频二创 shows each 二创方式 and 画面特效 as a picture card, and loads just those pictures", async () => {
  const h = harness(), set = [];
  h.api.request = async (p) => (p === "/config" ? { models: [], uiArt: {} } : { items: [] });
  const page = h.page("feature");
  page.onLoad({ key: "remix" });
  const cards = page.data.sections.filter((s) => s.type === "styles");
  assert.deepEqual(JSON.parse(JSON.stringify(cards.map((s) => s.label))), ["二创方式", "画面特效（单选）"]);
  assert.ok(cards.every((s) => s.values.every((v) => v.art)));
  const setData = page.setData.bind(page);
  page.setData = (d) => { set.push(d); setData(d); };
  page.onShow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const art = set.map((d) => d.art).filter(Boolean).at(-1);
  const named = JSON.parse(JSON.stringify(cards.flatMap((s) => s.values.map((v) => v.art)))).sort();
  assert.deepEqual(Object.keys(art).sort(), named);
});
