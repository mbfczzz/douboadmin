const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// AI证件照 案例: finished examples whose 做同款 sets 背景 / 服装 / 尺寸 and the
// prompt; the user's own photo is never replaced.
test("证件照案例 fill the chips and the prompt, not a stranger's face", async () => {
  const h = harness();
  h.api.request = async (p) => (p === "/config" ? { models: [], uiArt: { "id-blue-suit": "https://oss/id-blue-suit.jpg" } } : {});
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  const page = h.page("create");
  page.onLoad({ feature: "idphoto" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.featureCases.map((c) => c.id))), ["id:blue-suit", "id:white-shirt", "id:red-casual", "id:white-tee"]);
  await page.openCase({ currentTarget: { dataset: { id: "id:blue-suit" } } });
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.featureChoice)), { bg: 1, dress: 1, size: 0 });
  assert.match(page.data.prompt, /蓝色纯色背景，换成深色正装西服配白衬衫，按一寸/);
  assert.equal(page.data.assets.length, 0);
  assert.match(toasts.at(-1), /上传你的正脸照片/);
  assert.equal(h.nav.length, 0);
  // With the user's photo in, it stays.
  page.setData({ assets: [{ id: "me", isImage: true, data: { type: "image/jpeg", url: "u" } }] });
  await page.openCase({ currentTarget: { dataset: { id: "id:red-casual" } } });
  assert.match(page.data.prompt, /红色纯色背景，保留原来的服装，按小二寸/);
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.assets.map((a) => a.id))), ["me"]);
});
