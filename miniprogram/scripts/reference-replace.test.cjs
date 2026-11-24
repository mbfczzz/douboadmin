const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = () => new Promise(setImmediate);
const model = { id: "v", name: "视频", kind: "video", durations: [5], resolutions: ["720p"], ratios: ["9:16"], referenceTypes: ["image", "video"], modes: ["t2v", "omni_ref"] };
const pic = (id) => ({ id, isImage: true, isVideo: false, data: { url: "/m/" + id + ".jpg", type: "image/jpeg", size: 1 } });

async function editor() {
  const h = harness(), page = h.page("create");
  h.api.request = async () => ({ models: [model] });
  await page.loadModels();
  page.setData({ assets: [pic("a"), pic("b")], prompt: "女生拿出@图片1，再看@图片2", hasPrompt: true });
  h.api.chooseReferenceFile = async () => ({ path: "new.jpg", size: 1 });
  h.api.upload = async () => ({ id: "n", data: { url: "/m/n.jpg", type: "image/jpeg", size: 1 } });
  return { h, page };
}

test("替换 keeps the reference's number, so @图片1 points at the new picture", async () => {
  const { page } = await editor();
  await page.viewerReplace({ detail: { id: "a" } });
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["n", "b"]);
  assert.equal(page.data.prompt, "女生拿出@图片1，再看@图片2");
});

test("a replacement over the model's size limit is refused before uploading", async () => {
  const { h, page } = await editor();
  page.setData({ availableModels: [{ ...model, settings: { refLimits: { "omniRef.imageSizeMB": 1 } } }] });
  h.api.chooseReferenceFile = async () => ({ path: "big.jpg", size: 2 * 1024 * 1024 });
  let uploads = 0;
  h.api.upload = async () => (uploads++, { id: "n", data: { type: "image/jpeg", size: 1 } });
  const errors = [];
  h.wx.showToast = (o) => errors.push(o.title);
  await page.viewerReplace({ detail: { id: "a" } });
  assert.equal(uploads, 0);
  assert.match(errors.join(), /不能超过 1 MB/);
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["a", "b"]);
  assert.equal(page.data.uploading, false);
});

test("× on a referenced picture offers 换一张 before dropping the mention", async () => {
  let { h, page } = await editor();
  const asked = [];
  h.wx.showModal = (o) => (asked.push(o.title), o.success({ confirm: true, cancel: false }));
  page.remove({ currentTarget: { dataset: { id: "a" } } });
  await tick(); await tick();
  assert.deepEqual(asked, ["描述里引用了图片1"]);
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["n", "b"], "换一张 replaces in place");
  assert.match(page.data.prompt, /@图片1/);

  ({ h, page } = await editor());
  h.wx.showModal = (o) => o.success({ confirm: false, cancel: true });
  page.remove({ currentTarget: { dataset: { id: "b" } } });
  await tick();
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["a"], "删除 still removes");
  assert.doesNotMatch(page.data.prompt, /@图片2/);
});

test("× on a picture the description does not name removes it without asking", async () => {
  const { h, page } = await editor();
  page.setData({ prompt: "只用@图片2" });
  let asked = 0;
  h.wx.showModal = () => asked++;
  page.remove({ currentTarget: { dataset: { id: "a" } } });
  await tick();
  assert.equal(asked, 0);
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["b"]);
});

test("tapping an uploaded template photo replaces it in the same slot", async () => {
  const h = harness(), page = h.page("template-detail");
  page.setData({ template: { id: "t", data: { requiredImages: 2 } }, assets: [pic("a"), pic("b")] });
  h.api.chooseMediaFile = async () => ({ path: "new.jpg" });
  page.replaceSlot({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(page.data.sourceOpen, true);
  await page.chooseSource({ currentTarget: { dataset: { index: 0 } } });
  h.nav.at(-1).events.confirmed(pic("n"));
  page.onShow(); // back from the photo preview
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["n", "b"]);
  page.choose(); // the add button still appends
  await page.chooseSource({ currentTarget: { dataset: { index: 0 } } });
  h.nav.at(-1).events.confirmed(pic("m"));
  assert.deepEqual(plain(page.data.assets.map((a) => a.id)), ["n", "b", "m"]);
});

test("an Agent draft attachment 替换 keeps its number", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  h.wx.showActionSheet = (o) => o.success({ tapIndex: 1 });
  h.wx.chooseMedia = async () => ({ tempFiles: [{ tempFilePath: "n.jpg", size: 1 }] });
  h.api.upload = async () => ({ id: "n", data: { type: "image/jpeg", url: "/m/n.jpg" } });
  const puts = [];
  h.wx.request = (o) => (o.method === "PUT" && puts.push(o.data), o.success({ statusCode: 200, data: { id: "s1", version: 2, data: { title: "店", skill: "store", assets: (o.data || {}).assets || [] } } }));
  const a = { ...pic("a"), label: "图片1", fresh: true }, b = { ...pic("b"), label: "图片2", fresh: true };
  page.setData({ session: { id: "s1", version: 1, data: { title: "店", skill: "store", assets: [] }, assets: [] }, materials: [a, b], attached: [a, b] });
  page.attachAction({ currentTarget: { dataset: { id: "a" } } });
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(plain(puts[0].assets), ["n", "b"]);
  assert.deepEqual(plain(page.data.attached.map((m) => [m.id, m.label])), [["n", "图片1"], ["b", "图片2"]]);
  page.onUnload();
});
