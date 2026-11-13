import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
function load(name) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(
      new URL(`../src/components/${name}.ts`, import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    crypto: webcrypto,
  });
  return module.exports;
}
const { validPassword, passwordRules } = load("password-policy");
const { randomPassword, randomAccount } = load("credentials");
test("password validation accepts only exactly eight alphanumeric mixed-case characters", () => {
  for (const value of ["Ab123456", "ABCDEFGa", "abcdefgH", "AaBbCcDd"])
    assert.ok(validPassword(value));
  for (const value of [
    "",
    "12345678",
    "abcdefgh",
    "ABCDEFGH",
    "Ab12345",
    "Ab1234567",
    "Ab12!456",
    "Ab12 456",
    "Ab12_456",
    "中文Aa1234",
    "Ａa123456",
    "Ab12345\n",
    "Ab123456\n",
  ])
    assert.ok(!validPassword(value), value);
  assert.equal(passwordRules.minLength, 8);
  assert.equal(passwordRules.maxLength, 8);
});
test("automatic account passwords satisfy the same rule on every generation", () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const p = randomPassword();
    assert.ok(validPassword(p));
    seen.add(p);
  }
  assert.ok(seen.size > 995);
  assert.match(randomAccount(), /^sp\d{6}$/);
});
