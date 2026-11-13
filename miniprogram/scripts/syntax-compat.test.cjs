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
