const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(file, "utf8");
const tokens = (text) => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const mini = tokens(read("styles/theme.wxss"));
const web = tokens(read("../web/src/styles/base.css"));
const luminance = (hex) => hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255)
  .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test("web and mini use the reference palette for matching semantic roles", () => {
  for (const [m, w] of Object.entries({bg:"canvas", surface:"surface", field:"surface-subtle", text:"ink", muted:"muted", brand:"primary", "on-brand":"accent-ink", accent:"accent", magenta:"magenta", nav:"nav-selected", danger:"danger"})) {
    assert.equal(mini["--ui-" + m], web["--" + w], m);
  }
  assert.equal(JSON.parse(read("app.json")).window.backgroundColor, mini["--ui-bg"]);
  assert.ok(read("app.ts").includes(`backgroundColor: "${mini["--ui-bg"]}"`));
});

test("body, helper text, primary actions and selected navigation meet text contrast", () => {
  const pairs = [["--ui-text","--ui-bg"],["--ui-muted","--ui-surface"],["--ui-muted","--ui-field"],["--ui-on-brand","--ui-brand"],["--ui-danger","--ui-danger-bg"]];
  for (const [fg,bg] of pairs) assert.ok(contrast(mini[fg],mini[bg]) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrast("#ffffff",mini["--ui-magenta"]) >= 4.5);
  assert.ok(contrast(mini["--ui-on-brand"],"#d5f7ff") >= 4.5);
  assert.ok(contrast(mini["--ui-accent"],mini["--ui-surface"]) >= 4.5);
  assert.ok(contrast(mini["--ui-muted"],mini["--ui-selected"]) >= 4.5);
  assert.ok(contrast("#ffffff","#c40963") >= 4.5);
});

test("authored UI has no obsolete mint theme or old page background", () => {
  const walk = (dir) => fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry) => {
    const file=path.join(dir,entry.name);
    return entry.isDirectory() ? walk(file) : /\.(wxss|wxml|ts)$/.test(file) ? [file] : [];
  });
  for (const file of ["app.ts",...walk("pages"),...walk("components"),...walk("styles"),...walk("custom-tab-bar")]) {
    assert.doesNotMatch(read(file), /#(?:9bcbaa|131516|86b796|39463d)\b/i, file);
  }
  for (const file of ["pages/orders/index.wxss","pages/wallet/index.wxss"]) assert.ok(read(file).includes("#32d47a"));
});
