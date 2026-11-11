const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

const model = (id, kind = "video") => ({
  id, kind, name: id,
  icon: `https://icons.test/${id}.png?signature=fixture`,
  resolutions: ["720p"], ratios: ["16:9"],
});
const selected = (page) => page.data.availableModels[page.data.modelIndex];

test("selected icon follows initial choice, selection and catalog reorder", async () => {
  const h = harness(), page = h.page("create");
  let models = [model("a"), model("b"), model("image", "image")];
  h.api.request = async () => ({ models });
  await page.loadModels();
  assert.equal(selected(page).id, "a");
  page.selectModel({ currentTarget: { dataset: { id: "b" } } });
  assert.equal(selected(page).iconURL, models[1].icon);
  models = [models[1], models[0], models[2]];
  await page.loadModels();
  assert.equal(page.data.modelIndex, 0);
  assert.equal(selected(page).id, "b");
  page.mode({ currentTarget: { dataset: { kind: "image" } } });
  await new Promise(setImmediate);
  assert.equal(selected(page).id, "image");
  models = [];
  await page.loadModels();
  assert.equal(selected(page), undefined, "empty catalogs cannot retain a stale logo");
});

test("icon errors target shared model data and cannot affect a later selection", async () => {
  const h = harness(), page = h.page("create");
  const models = [model("a"), model("b")];
  h.api.request = async () => ({ models });
  await page.loadModels();
  page.selectModel({ currentTarget: { dataset: { id: "b" } } });
  const patches = [];
  page.setData = (patch) => patches.push(patch);
  page.hideModelIcon({ currentTarget: { dataset: { id: "a", url: models[0].icon } } });
  assert.equal(patches[0]["availableModels[0].iconURL"], "");
  assert.equal(selected(page).id, "b");
  page.hideModelIcon({ currentTarget: { dataset: { id: "b", url: models[1].icon } } });
  assert.equal(patches[1]["availableModels[1].iconURL"], "");
  assert.equal(patches[1]["availableModels[1].icon"], "");
});

test("selector and dropdown share the same image, glyph and fallback template", () => {
  const wxml = fs.readFileSync("pages/create/index.wxml", "utf8");
  assert.match(wxml, /<template is="model-icon" data="{{\.\.\.availableModels\[modelIndex\],kind}}"/);
  assert.match(wxml, /<template is="model-icon" data="{{\.\.\.item,kind}}"/);
  assert.equal((wxml.match(/<template name="model-icon">/g) || []).length, 1);
  const icon = wxml.slice(wxml.indexOf('<template name="model-icon">'));
  assert.match(icon, /src="{{iconURL}}"/);
  assert.match(icon, /binderror="hideModelIcon"/);
  assert.match(icon, /wx:elif="{{icon}}"/);
  assert.match(icon, /<t-icon wx:else/);
});
