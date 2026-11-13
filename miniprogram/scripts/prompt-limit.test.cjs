const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const event = (data) => ({ currentTarget: { dataset: data } });
const model = (kind, limit) => ({
  id: kind, name: kind, kind, modes: [], resolutions: [], ratios: [],
  durations: [5], referenceTypes: [], settings: { maxPromptChars: limit },
});

test("image and video defaults follow the selected kind and refresh configured limits", async () => {
  const h = harness(), page = h.page("create");
  let videoLimit = 0;
  h.api.request = async () => ({ models: [model("image", 0), model("video", videoLimit)] });
  assert.equal(page.data.maxPromptChars, 20000);
  await page.loadModels();
  assert.equal(page.data.maxPromptChars, 20000);
  page.input({ detail: { value: "景".repeat(2500) } });
  page.mode(event({ kind: "image" }));
  assert.equal(page.data.maxPromptChars, 2000);
  await page.loadModels();
  assert.equal(page.data.maxPromptChars, 2000);
  assert.equal(page.data.prompt.length, 2500);
  let submissions = 0;
  h.api.submitInput = async () => { submissions++; return { id: "test-job" }; };
  await page.generate();
  assert.equal(submissions, 0);
  page.mode(event({ kind: "video" }));
  await page.loadModels();
  videoLimit = 30000;
  await page.loadModels();
  assert.equal(page.data.maxPromptChars, 30000);
  assert.equal(page.data.prompt.length, 2500);
  videoLimit = 500;
  await page.loadModels();
  assert.equal(page.data.maxPromptChars, 500);
  assert.equal(page.data.prompt.length, 2500);
});

for (const [kind, configured, limit] of [["image", 0, 2000], ["video", 0, 20000], ["image", 4000, 4000], ["video", 30000, 30000]]) {
  test(`${kind}: ${limit} characters submit intact; the next character is rejected`, async () => {
    const h = harness(), page = h.page("create"), sent = [];
    h.api.request = async () => ({ models: [model(kind, configured)] });
    h.api.submitInput = async (input) => { sent.push(input); return { id: "test-job" }; };
    page.setData({ kind });
    await page.loadModels();
    page.visible = false;
    const prompt = "景".repeat(limit);
    page.input({ detail: { value: prompt } });
    await page.generate();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].prompt, prompt);
    page.input({ detail: { value: prompt + "光" } });
    await page.generate();
    assert.equal(sent.length, 1);
    assert.equal(page.data.prompt.length, limit + 1);
  });
}
