const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
test("an unavailable favorite stays visible and can be removed", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("library");
  let active = true;
  h.api.request = async (path, method, body) => {
    if (method === "PUT") {
      assert.equal(path, "/favorites/hidden");
      assert.equal(body.active, false);
      assert.equal(body.version, 2);
      active = false;
      return {};
    }
    if (path.startsWith("/favorites/templates?"))
      return {items:[],total:active ? 1 : 0,unavailable:active ? [
        { id: "fav-1", version: 2, data: { templateId: "hidden", active } },
      ] : []};
    return [];
  };
  await page.load();
  assert.equal(page.data.templates.length, 0);
  assert.equal(page.data.unavailableFavorites.length, 1);
  await page.removeFavorite({ currentTarget: { dataset: { id: "fav-1" } } });
  assert.equal(page.data.unavailableFavorites.length, 0);
  assert.equal(page.data.removingFavorite, "");
});
