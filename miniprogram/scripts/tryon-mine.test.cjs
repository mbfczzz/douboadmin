const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// 我的服装 (AI试衣 → 服装 → 我的): own outfits, uploaded or drawn by AI.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const plain = (v) => JSON.parse(JSON.stringify(v));

function mine(reply) {
  const h = harness(), calls = [];
  h.api.request = async (path, method, body) => {
    if (path === "/config") return { models: [{ id: "img", kind: "image", referenceTypes: ["image"], ratios: ["1:1", "3:4"], resolutions: ["2K"], qualities: [], durations: [], modes: ["i2i"] }], uiArt: {} };
    calls.push([path, method || "GET", body]);
    return reply(path, method, body);
  };
  const page = h.page("tryon");
  page.onLoad();
  return { h, page, calls };
}

test("我的 lists the user's outfits; a ready one goes to 试穿 as their own picture", async () => {
  const { page, calls } = mine((path) => (path === "/my-outfits" ? { items: [{ id: "m1", title: "通勤风衣", assetId: "a1", image: "https://oss/a1.jpg", source: "ai", status: "ready" }, { id: "m2", title: "AI 生成的服装", source: "ai", status: "drawing" }] } : {}));
  page.toggleMine();
  await settle();
  assert.equal(page.data.mine, true);
  assert.equal(calls.at(-1)[0], "/my-outfits");
  assert.equal(page.data.myOutfits.length, 2);
  page.wearMine({ currentTarget: { dataset: { id: "m2" } } }); // still drawing: nothing
  assert.equal(page.data.garment, null);
  page.wearMine({ currentTarget: { dataset: { id: "m1" } } });
  assert.deepEqual(plain(page.data.garment), { asset: "a1", url: "https://oss/a1.jpg", title: "通勤风衣", description: "" });
  assert.equal(page.data.tab, "fit");
  page.toggleMine();
  assert.equal(page.data.mine, false);
  page.onUnload();
});

test("自己上传 adds the picture as it is; AI 生成 submits an image task with the default prompt and registers it", async () => {
  const { h, page, calls } = mine((path, method) => (path === "/my-outfits" && method !== "POST" ? { items: [] } : { id: "x" }));
  h.api.chooseMediaFile = async () => ({ path: "tmp/look.jpg", name: "look.jpg" });
  h.api.upload = async () => ({ id: "look", data: { url: "https://oss/look.jpg", type: "image/jpeg" } });
  page.setData({ mine: true });
  await page.uploadMine();
  assert.deepEqual(plain(calls.find((c) => c[1] === "POST")), ["/my-outfits", "POST", { asset: "look" }]);
  const sent = [];
  h.api.submitInput = async (input, channel) => { sent.push([input, channel]); return { id: "job-1" }; };
  h.wx.showModal = async (o) => ({ confirm: true, content: o.content });
  await page.aiMine();
  const [input, channel] = sent[0];
  assert.equal(channel, "outfit-ai");
  assert.equal(input.kind, "image");
  assert.equal(input.ratio, "3:4");
  assert.deepEqual(plain(input.assets), ["look"]);
  assert.match(input.prompt, /^参考@图片1 中的整套穿搭[^]*隐形人台[^]*不出现人物/);
  assert.deepEqual(plain(calls.filter((c) => c[1] === "POST").at(-1)), ["/my-outfits", "POST", { job: "job-1" }]);
  assert.equal(page.data.myBusy, "");
  // Cancelling the prompt dialog submits nothing.
  h.wx.showModal = async () => ({ confirm: false });
  await page.aiMine();
  assert.equal(sent.length, 1);
  page.onUnload();
});
