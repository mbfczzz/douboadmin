const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness } = require("./harness.cjs");

test("open signup enters directly without submitting an invite", async () => {
  const h = harness(),
    page = h.page("activate"),
    calls = [],
    moves = [];
  await h.api.signIn();
  page.owner = h.api.sessionUserId();
  page.setData({
    logged: true,
    loading: false,
    status: { active: false, status: "pending", openSignup: true },
  });
  h.api.request = async (route, method, body) => {
    calls.push([route, method, body]);
    return { active: true, status: "direct", openSignup: true };
  };
  h.wx.reLaunch = (options) => moves.push(options.url);
  await page.direct();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["/access/direct", "POST", {}],
  ]);
  assert.deepEqual(moves, ["/pages/templates/index"]);
});

test("invite entry hides direct signup so the provider path wins", () => {
  const markup = fs.readFileSync(
    path.join(__dirname, "../pages/activate/index.wxml"),
    "utf8",
  );
  assert.match(markup, /status\.openSignup&&!invite/);
  assert.match(markup, /bindtap="direct"/);
});
