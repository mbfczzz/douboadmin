const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(file, "utf8");
const tokens = (text) => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const mini = tokens(read("styles/theme.wxss"));
const luminance = (hex) => hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255)
  .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

// The sampled app theme applies to pages, native chrome and components.
test("mini-program uses neutral app surfaces and matching native chrome", () => {
  assert.equal(mini["--ui-bg"], "#0f0f11");
  assert.equal(mini["--ui-surface"], "#1d1e23");
  assert.equal(mini["--ui-brand"], "#00c8dc");
  assert.equal(mini["--ui-primary"], "#ebf8ff");
  assert.match(read("styles/theme.wxss"), /background: var\(--ui-bg\)/);
  assert.equal(JSON.parse(read("app.json")).window.navigationBarTextStyle, "white");
  assert.equal(JSON.parse(read("app.json")).window.backgroundColor, mini["--ui-bg"]);
  assert.ok(read("app.ts").includes(`backgroundColor: "${mini["--ui-bg"]}"`));
});

test("body, helper text, primary actions and selected options meet text contrast", () => {
  const pairs = [["--ui-text","--ui-bg"],["--ui-text","--ui-surface"],["--ui-muted","--ui-surface"],["--ui-muted","--ui-field"],["--ui-on-brand","--ui-primary"],["--ui-on-brand","--ui-brand"],["--ui-danger","--ui-danger-bg"],["--ui-text","--ui-selected"]];
  for (const [fg,bg] of pairs) assert.ok(contrast(mini[fg],mini[bg]) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrast(mini["--ui-brand"],mini["--ui-surface"]) >= 4.5);
});

test("authored UI has no obsolete navy, light-blue or mint surfaces", () => {
  const walk = (dir) => fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry) => {
    const file=path.join(dir,entry.name);
    return entry.isDirectory() ? walk(file) : /\.(wxss|wxml|ts)$/.test(file) ? [file] : [];
  });
  for (const file of ["app.ts",...walk("pages"),...walk("components"),...walk("styles"),...walk("custom-tab-bar")]) {
    assert.doesNotMatch(read(file), /#(?:9bcbaa|131516|86b796|39463d|02070d|0b1b2c|03172b|13283d|1d3650|f5f6f8|365bc0)\b/i, file);
  }
  for (const file of ["pages/orders/index.wxss","pages/wallet/index.wxss"]) assert.ok(read(file).includes("#45d18a"));
});
