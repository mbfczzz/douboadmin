import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/models/settings.ts", import.meta.url),
  "utf8",
);
let compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const optionsSource = await readFile(
  new URL("../src/models/parameter-options.ts", import.meta.url),
  "utf8",
);
const optionsCode = ts.transpileModule(optionsSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const optionsURL = `data:text/javascript;base64,${Buffer.from(optionsCode).toString("base64")}`;
compiled = compiled.replace(
  '"./parameter-options"',
  JSON.stringify(optionsURL),
);
const { modelDraft, rebaseDraft, effectiveModel } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const model = {
  id: "m",
  name: "test",
  kind: "image",
  modes: ["t2i"],
  ratios: ["1:1"],
  qualities: ["low"],
  resolutions: ["1k", "2k"],
  durations: [],
  referenceTypes: [],
  settings: {
    priceMatrix: { low: { "1k": 2, "2k": 4 } },
    pricePerRequestByResolution: { "1k": 2, "2k": 4 },
  },
};

test("legacy video durations are distinct and sorted like the mini program slider", () => {
  const m = {
    ...model,
    kind: "video",
    durations: [30, 1, 15, 1, 31, 0],
    settings: {},
  };
  assert.deepEqual(effectiveModel(m).durations, [1, 15, 30]);
  assert.deepEqual(modelDraft(m).settings.durations, [1, 15, 30]);
});

test("conflict rebase preserves independently edited pricing cells", () => {
  const base = modelDraft(model),
    edited = structuredClone(base),
    latest = structuredClone(base);
  edited.settings.priceMatrix.low["1k"] = 3;
  delete edited.settings.pricePerRequestByResolution["1k"];
  latest.settings.priceMatrix.low["2k"] = 8;
  latest.settings.pricePerRequestByResolution["2k"] = 9;
  latest.settings.hideResolution = true;
  latest.settings.resolutions = [];
  const merged = rebaseDraft(base, edited, latest);
  assert.deepEqual(merged.settings.priceMatrix.low, { "1k": 3, "2k": 8 });
  assert.deepEqual(merged.settings.pricePerRequestByResolution, { "2k": 9 });
  assert.equal(merged.settings.hideResolution, true);
  assert.deepEqual(merged.settings.resolutions, []);
  assert.equal(latest.settings.priceMatrix.low["1k"], 2);
});

test("clearing one matrix cell keeps new cells added by another editor", () => {
  const base = modelDraft(model),
    edited = structuredClone(base),
    latest = structuredClone(base);
  delete edited.settings.priceMatrix.low["1k"];
  latest.settings.priceMatrix.low["4k"] = 12;
  const merged = rebaseDraft(base, edited, latest);
  assert.deepEqual(merged.settings.priceMatrix.low, { "2k": 4, "4k": 12 });
});

test("legacy null capability arrays normalize without reopening hidden selections", () => {
  const legacy = {
    ...model,
    resolutions: null,
    qualities: null,
    modes: null,
    ratios: null,
    durations: null,
    referenceTypes: null,
    settings: { hideResolution: true, hideQuality: true },
  };
  const draft = modelDraft(legacy),
    effective = effectiveModel(draft);
  for (const key of [
    "resolutions",
    "qualities",
    "modes",
    "ratios",
    "durations",
    "referenceTypes",
  ]) {
    assert.deepEqual(draft[key], [], key);
    assert.deepEqual(effective[key], [], key);
  }
  assert.deepEqual(draft.settings.resolutions, []);
  assert.deepEqual(draft.settings.qualities, []);
});
