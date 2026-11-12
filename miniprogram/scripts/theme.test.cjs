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

// Approved light canvas with indigo actions, teal activity and amber credit.
test("mini-program light palette matches native chrome", () => {
  assert.equal(mini["--ui-bg"], "#f4f6f8");
  assert.equal(mini["--ui-surface"], "#ffffff");
  assert.equal(mini["--ui-brand"], "#4255c7");
  assert.equal(mini["--ui-primary"], "#4255c7");
  assert.match(read("styles/theme.wxss"), /background: var\(--ui-bg\)/);
  assert.equal(JSON.parse(read("app.json")).window.navigationBarTextStyle, "black");
  assert.equal(JSON.parse(read("app.json")).window.backgroundColor, mini["--ui-bg"]);
  assert.ok(read("app.ts").includes(`backgroundColor: "${mini["--ui-bg"]}"`));
  const app = JSON.parse(read("app.json"));
  for (const key of ["backgroundColor", "backgroundColorTop", "backgroundColorBottom"]) {
    assert.equal(app.window[key], mini["--ui-bg"], key);
    assert.ok(read("app.ts").includes(`${key}: "${mini["--ui-bg"]}"`));
  }
  assert.equal(app.tabBar.backgroundColor, mini["--ui-surface"]);
  assert.equal(app.tabBar.selectedColor, mini["--ui-nav"]);
  for (const route of app.pages) {
    const config = JSON.parse(read(route + ".json"));
    for (const key of ["backgroundColor", "backgroundColorTop", "backgroundColorBottom"])
      if (config[key]) assert.equal(config[key], mini["--ui-bg"], route + ": " + key);
  }
});

test("body, helper text, primary actions and selected options meet text contrast", () => {
  const pairs = [["--ui-text","--ui-bg"],["--ui-text","--ui-surface"],["--ui-muted","--ui-surface"],["--ui-muted","--ui-field"],["--ui-on-brand","--ui-primary"],["--ui-on-brand","--ui-brand"],["--ui-danger","--ui-danger-bg"],["--ui-text","--ui-selected"]];
  for (const [fg,bg] of pairs) assert.ok(contrast(mini[fg],mini[bg]) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrast(mini["--ui-brand"],mini["--ui-surface"]) >= 4.5);
  for(const [fg,bg] of [["--ui-gold","--ui-gold-bg"],["--ui-gold-muted","--ui-gold-bg"],["--ui-link","--ui-selected"],["--ui-info","--ui-info-bg"],["--ui-success","--ui-success-bg"],["--ui-warning","--ui-warning-bg"]])
    assert.ok(contrast(mini[fg],mini[bg]) >= 4.5, `${fg} on ${bg}`);
});

test("authored UI has no stale dark-theme surfaces or mint controls", () => {
  const walk = (dir) => fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry) => {
    const file=path.join(dir,entry.name);
    return entry.isDirectory() ? walk(file) : /\.(wxss|wxml|ts)$/.test(file) ? [file] : [];
  });
  for (const file of ["app.ts",...walk("pages"),...walk("components"),...walk("styles"),...walk("custom-tab-bar")]) {
    assert.doesNotMatch(read(file), /#(?:d92348|bd173b|fff0f3|2563eb|1d4ed8|e8effc|24252b|393b43|22262e|272b34|2e333d|00c8dc|ebf8ff|a6abb4|aab4bd|ff526c|45d18a)\b/i, file);
  }
  for (const file of ["pages/orders/index.wxss","pages/wallet/index.wxss"]) assert.ok(read(file).includes("var(--ui-success)"));
});
