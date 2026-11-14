// Bundled art (assets/photos, assets/glyphs, assets/tab): every path the UI
// names must exist, and every file must be used, so the upload package
// carries no dead pictures.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const sources = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(wxml|ts)$/.test(name)) sources.push(fs.readFileSync(full, "utf8"));
  }
})(path.join(root, "pages"));
for (const dir of ["components", "custom-tab-bar", "utils", "services"]) {
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(wxml|ts)$/.test(name)) sources.push(fs.readFileSync(full, "utf8"));
    }
  })(path.join(root, dir));
}
const text = sources.join("\n");
const files = ["photos", "glyphs", "tab"].flatMap((d) =>
  fs.readdirSync(path.join(root, "assets", d)).map((f) => `${d}/${f}`),
);

const referenced = new Set();
test("every literal asset path exists", () => {
  // Expand simple {{cond?'a':'b'}} choices inside a path.
  const paths = [...text.matchAll(/\/assets\/((?:photos|glyphs|tab)\/(?:\{\{[^}]*\}\}|\$\{[^}]*\}|[^"'`\s{$])+?\.(?:png|jpg))/g)].map((m) => m[1]);
  assert.ok(paths.length > 20);
  for (const raw of paths) {
    const choice = raw.match(/\{\{[^?}]*\?'([^']*)':'([^']*)'\}\}/);
    const variants = choice ? [raw.replace(choice[0], choice[1]), raw.replace(choice[0], choice[2])] : [raw];
    for (const p of variants) {
      if (p.includes("{{") || p.includes("${")) continue; // data-driven, checked below
      assert.ok(files.includes(p), `missing assets/${p}`);
      referenced.add(p);
    }
  }
});

test("every bundled picture is used somewhere", () => {
  for (const file of files) {
    const stem = path.basename(file).replace(/\.(png|jpg)$/, "");
    const base = stem.replace(/-(muted|danger|on|off)$/, "");
    const used = referenced.has(file) || text.includes(stem) || new RegExp(`["'(]${base}["')]`).test(text) || text.includes(`/${base}`);
    assert.ok(used, `unused assets/${file}`);
  }
});

test("mix feature glyphs exist in both states", () => {
  const glyphs = [...fs.readFileSync(path.join(root, "pages/mix/state.ts"), "utf8").matchAll(/glyph: "([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(glyphs.length, 4);
  for (const g of glyphs) for (const f of [`${g}.png`, `${g}-muted.png`]) assert.ok(files.includes(`glyphs/${f}`), f);
});

test("components that use glyph classes import them (app.wxss does not reach inside)", () => {
  for (const dir of [...fs.readdirSync(path.join(root, "components")).map((d) => `components/${d}`), "custom-tab-bar"]) {
    const wxml = path.join(root, dir, "index.wxml");
    if (!fs.existsSync(wxml) || !/class="[^"]*\bgl\b/.test(fs.readFileSync(wxml, "utf8"))) continue;
    assert.match(fs.readFileSync(path.join(root, dir, "index.wxss"), "utf8"), /@import "\.\.\/\.\.\/styles\/glyphs\.wxss";/, dir);
  }
});
