const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// Interface-first feature pages (pages/feature): fill-in examples.
test("视频唱歌 / 数字人 / 视频二创 offer examples that fill what the user would give", async () => {
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
  // 视频二创: real hot videos; a tap fills the link box.
  const r = harness();
  await r.api.signIn();
  r.api.request = async (p) => (p.startsWith("/hot/videos?") ? { items: [{ id: "7301", cover: "https://c/1.jpg", title: "热门一", sourceUrl: "https://www.douyin.com/video/7301" }, { id: "7302", cover: "", title: "无封面" }] } : { models: [], uiArt: {} });
  const remix = r.page("feature");
  remix.onLoad({ key: "remix" });
  remix.onShow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const hot = remix.data.sections.findIndex((s) => s.type === "hotlinks");
  assert.deepEqual(remix.data.sections[hot].links.map((l) => l.id), ["7301"]);
  remix.useHotLink({ currentTarget: { dataset: { section: hot, index: 0 } } });
  assert.equal(remix.data.sections.find((s) => s.type === "text").value, "https://www.douyin.com/video/7301");
});
