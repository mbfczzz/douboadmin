const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// An <image> without a size is drawn 320 × 240 by WeChat: every gl-N size
// the markup uses must exist in styles/glyphs.wxss.
function wxml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") wxml(p, out);
    else if (e.name.endsWith(".wxml")) out.push(p);
  }
  return out;
}

test("every glyph size used in markup has a style", () => {
  const css = fs.readFileSync("styles/glyphs.wxss", "utf8");
  const missing = new Set();
  for (const file of [...wxml("pages"), ...wxml("components"), ...wxml("custom-tab-bar")])
    for (const m of fs.readFileSync(file, "utf8").matchAll(/\bgl-(\d+)\b/g))
      if (!new RegExp(`\\.gl-${m[1]}\\s*\\{`).test(css)) missing.add(`gl-${m[1]} (${file})`);
  assert.deepEqual([...missing], []);
});
