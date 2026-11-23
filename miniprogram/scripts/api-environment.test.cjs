const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function base(envVersion, fail = false) {
  const source = fs.readFileSync("config.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const wx = { getAccountInfoSync() { if (fail) throw new Error("unavailable"); return { miniProgram: { envVersion } }; } };
  Function("module", "exports", "wx", code)(module, module.exports, wx);
  return module.exports.API_BASE;
}

test("trial review and release use production while development stays isolated", () => {
  assert.equal(base("release"), "https://mbygkj.com");
  assert.equal(base("trial"), "https://mbygkj.com");
  assert.equal(base("develop"), "http://106.15.92.153:8088");
  assert.equal(base(undefined, true), "http://106.15.92.153:8088");
});
