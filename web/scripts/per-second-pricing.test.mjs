import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/models/per-second-pricing.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { fillPerSecond, inferPerSecond, perSecondError } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("13 points per second fills selected durations without changing other columns or hidden rows", () => {
  const before = {
    "4s": { "480p": 1, "720p": 80 },
    "14s": { "480p": 181 },
    "30s": { "480p": 999 },
  };
  const out = fillPerSecond(before, "480p", [4, 5, 14], "13");
  assert.equal(out["4s"]["480p"], 52);
  assert.equal(out["5s"]["480p"], 65);
  assert.equal(out["14s"]["480p"], 182);
  assert.equal(out["4s"]["720p"], 80);
  assert.equal(out["30s"]["480p"], 999);
  assert.equal(before["4s"]["480p"], 1);
  assert.equal(inferPerSecond(out, "480p", [4, 5, 14]), "13");
});

test("fractional and free rates use exact hundredths and remain inferable", () => {
  const out = fillPerSecond(undefined, "768p", [1, 3, 30], "0.1");
  assert.equal(out["3s"]["768p"], 0.3);
  assert.equal(out["30s"]["768p"], 3);
  assert.equal(inferPerSecond(out, "768p", [1, 3, 30]), "0.1");
  const free = fillPerSecond(out, "768p", [1, 3, 30], "0");
  assert.equal(free["3s"]["768p"], 0);
  assert.equal(inferPerSecond(free, "768p", [1, 3, 30]), "0");
  assert.equal(inferPerSecond(out, "768p", [1, 2, 3]), "");
});

test("blank, negative, invalid precision and overflowing totals cannot be applied", () => {
  for (const value of [
    "",
    "-1",
    "NaN",
    "Infinity",
    "0.001",
    "0.0000000001",
    "1e-9",
    "33333333.34",
  ]) {
    assert.throws(() => fillPerSecond({}, "4k", [30], value), /无效/);
  }
  assert.equal(perSecondError("33333333.33", [30]), "");
  assert.equal(
    fillPerSecond({}, "4k", [30], "33333333.33")["30s"]["4k"],
    999999999.9,
  );
});
