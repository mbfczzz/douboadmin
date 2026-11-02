const { test } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app.json");
const { harness } = require("./harness.cjs");

for (const route of app.pages) {
  test(`${route} compiles and registers a Page`, () => {
    const h = harness();
    const page = h.page(route.split("/")[1]);
    assert.ok(page.data);
  });
}
