// Read-only integration against a running real Go API. Does not spend relay credits.
// Native rendering and real wx.login still require the WeChat developer tools.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const origin = process.env.DOUBO_TEST_API || "http://127.0.0.1:5173";

function connected() {
  const h = harness();
  h.wx.reLaunch = (options) => h.nav.push(options);
  h.wx.request = (options) => {
    const url = options.url.replace(/^https?:\/\/[^/]+/, origin);
    fetch(url, {
      method: options.method,
      headers: options.header,
      body: options.method === "GET" ? undefined : JSON.stringify(options.data),
    })
      .then(async (r) =>
        options.success({ statusCode: r.status, data: await r.json() }),
      )
      .catch((e) => options.fail(e));
  };
  return h;
}

test("creation consumes backend models and capabilities without local demo fallbacks", async () => {
  const h = connected(),
    page = h.page("create");
  const config = await (await fetch(origin + "/api/config")).json();
  // demoLogin is a server setting (the local dev API enables it for browser
  // tests); what matters here is that no demo catalog leaks into creation.
  assert.equal(config.demo, false);
  if (config.activationRequired)
    assert.equal(
      config.models.length,
      0,
      "anonymous catalog must be hidden before activation",
    );
  assert.ok(config.models.every((m) => !m.id.startsWith("demo-")));
  for (const kind of ["video", "image"]) {
    page.setData({ kind });
    await page.loadModels();
    const models = config.models.filter((m) => m.kind === kind);
    assert.deepEqual(
      Array.from(page.data.availableModels, (m) => m.id),
      models.map((m) => m.id),
    );
    if (!models.length) {
      assert.equal(page.data.model, "");
      continue;
    }
    const model = models.find((m) => m.id === page.data.model);
    assert.ok(model);
    assert.equal(page.data.modelName, model.name);
    assert.deepEqual(Array.from(page.data.resolutions), model.resolutions);
    assert.deepEqual(Array.from(page.data.ratios), model.ratios);
    assert.deepEqual(Array.from(page.data.durations), model.durations || []);
    assert.deepEqual(Array.from(page.data.qualities), model.qualities || []);
  }
});

test("the template feed and category navigation come from the API", async () => {
  const h = connected(),
    page = h.page("templates");
  const config = await (await fetch(origin + "/api/config")).json();
  const response = await fetch(origin + "/api/templates");
  if (config.activationRequired) {
    assert.equal(response.status, 401);
    await page.load();
    await page.loadCategories();
    assert.equal(page.data.items.length, 0);
    assert.equal(page.data.categories.length, 0);
    return;
  }
  const rows = await response.json();
  await page.load();
  await page.loadCategories();
  assert.deepEqual(
    Array.from(page.data.items, (r) => r.id),
    rows.map((r) => r.id),
  );
  assert.ok(rows.every((r) => r.data.published && !r.data.deleted));
  assert.deepEqual(Array.from(page.data.categories), config.categories);
  assert.equal(page.data.loadError, "");
});
