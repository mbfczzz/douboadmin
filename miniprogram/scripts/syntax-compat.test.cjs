const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// WeChat's compiler and older JS engines reject ES2021 logical assignment;
// one such operator in a shared module stops the whole app from starting.
test("app sources avoid ES2021 logical assignment operators", () => {
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      ["node_modules", "miniprogram_npm", "scripts"].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ts") ? [path.join(d, e.name)] : [],
    );
  const offenders = walk(".").filter((f) => /\?\?=|\|\|=|&&=/.test(fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
  assert.deepEqual(offenders, []);
});

// WeChat renders through the phone's WebView. "inset" needs iOS 14.5 and
// "aspect-ratio" iOS 15: on older phones overlays lose their box and cover
// tiles collapse to zero height. Native buttons also carry WeChat's default
// width (184px) and disabled colours, which outrank a bare class selector.
test("styles avoid inset/aspect-ratio and target buttons as button.class", () => {
  const walk = (d, ext) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      ["node_modules", "miniprogram_npm", "scripts"].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name), ext) : e.name.endsWith(ext) ? [path.join(d, e.name)] : [],
    );
  const styles = walk(".", ".wxss").map((f) => [f, fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")]);
  assert.deepEqual(styles.filter(([, s]) => /(^|[;{\s])(inset|aspect-ratio)\s*:/m.test(s)).map(([f]) => f), []);
  // Every class put on a native <button> must be styled as button.<class>.
  const buttonClasses = new Set();
  for (const f of walk(".", ".wxml"))
    for (const m of fs.readFileSync(f, "utf8").matchAll(/<button\b([^>]*)>/g)) {
      const c = /class="([^"]*)"/.exec(m[1]);
      if (c) c[1].replace(/\{\{[\s\S]*?\}\}/g, "").split(/\s+/).filter(Boolean).forEach((k) => buttonClasses.add(k));
    }
  const loose = [];
  for (const [f, s] of styles)
    for (const sel of s.split(/\{[^{}]*\}/))
      for (const k of buttonClasses)
        if (new RegExp(`(^|[\\s,>+~(])\\.${k}(?![\\w-])`).test(sel) && !(k === "action" && !f.includes("points-balance")))
          loose.push(`${f}: .${k}`);
  assert.deepEqual(loose, []);
});
