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

// Sampled Jimeng app palette: neutral dark layers, light primary actions and
// cyan kept as a small accent.
test("mini-program dark palette matches native chrome", () => {
  assert.equal(mini["--ui-bg"], "#0f0f11");
  assert.equal(mini["--ui-surface"], "#24252b");
  assert.equal(mini["--ui-brand"], "#00c8dc");
  assert.equal(mini["--ui-primary"], "#ebf8ff");
  assert.match(read("styles/theme.wxss"), /background: var\(--ui-bg\)/);
  assert.equal(JSON.parse(read("app.json")).window.navigationBarTextStyle, "white");
  assert.equal(JSON.parse(read("app.json")).window.backgroundColor, mini["--ui-bg"]);
  assert.ok(read("app.ts").includes(`backgroundColor: "${mini["--ui-bg"]}"`));
  const app = JSON.parse(read("app.json"));
  for (const key of ["backgroundColor", "backgroundColorTop", "backgroundColorBottom"]) {
    assert.equal(app.window[key], mini["--ui-bg"], key);
    assert.ok(read("app.ts").includes(`${key}: "${mini["--ui-bg"]}"`));
  }
  assert.equal(app.window.backgroundTextStyle, "light");
  assert.equal(app.tabBar.backgroundColor, mini["--ui-tabbar"]);
  assert.equal(app.tabBar.selectedColor, mini["--ui-nav"]);
  for (const route of app.pages) {
    const config = JSON.parse(read(route + ".json"));
    for (const key of ["backgroundColor", "backgroundColorTop", "backgroundColorBottom"])
      if (config[key]) assert.equal(config[key], mini["--ui-bg"], route + ": " + key);
  }
});

test("body, helper text, primary actions and selected options meet text contrast", () => {
  const pairs = [["--ui-text","--ui-bg"],["--ui-text","--ui-surface"],["--ui-muted","--ui-surface"],["--ui-muted","--ui-field"],["--ui-on-brand","--ui-primary"],["--ui-on-brand","--ui-brand"],["--ui-danger","--ui-danger-bg"],["--ui-text","--ui-selected"],["--td-brand-color-active","--ui-selected"],["--ui-on-brand","--td-brand-color-active"]];
  for (const [fg,bg] of pairs) assert.ok(contrast(mini[fg],mini[bg]) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrast(mini["--ui-brand"],mini["--ui-surface"]) >= 4.5);
  for(const [fg,bg] of [["--ui-points","--ui-points-bg"],["--ui-points-muted","--ui-points-bg"],["--ui-link","--ui-selected"],["--ui-info","--ui-info-bg"],["--ui-success","--ui-success-bg"],["--ui-warning","--ui-warning-bg"]])
    assert.ok(contrast(mini[fg],mini[bg]) >= 4.5, `${fg} on ${bg}`);
});

test("authored UI has no stale light-theme surfaces or indigo controls", () => {
  const walk = (dir) => fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry) => {
    const file=path.join(dir,entry.name);
    return entry.isDirectory() ? walk(file) : /\.(wxss|wxml|ts)$/.test(file) ? [file] : [];
  });
  for (const file of ["app.ts",...walk("pages"),...walk("components"),...walk("styles"),...walk("custom-tab-bar")]) {
    let source = read(file);
    if (file.replaceAll("\\", "/") === "pages/provider/poster.wxss") {
      // The scanner's white paper intentionally uses dark, high-contrast text.
      assert.match(source, /\.invite-paper\s*\{[^}]*background: #fff;/);
      assert.ok(contrast("#667085", "#ffffff") >= 4.5);
      source = source.replace(/\.invite-(?:caption|number)\s*\{[^}]*\}/g, "");
    }
    assert.doesNotMatch(source, /#(?:f4f6f8|f1f4f8|d7dee6|202632|667085|4255c7|3445aa|eef0ff|f2f4ff|dde2fb|e8f1fc|fff0f2|eaf7ef|fff5d9|e9edf2)\b/i, file);
  }
  for (const file of ["pages/orders/index.wxss","pages/wallet/index.wxss"]) assert.ok(read(file).includes("var(--ui-success)"));
});
