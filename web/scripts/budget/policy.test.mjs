import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, limits } from "./policy.mjs";

function report() {
  return {
    initialJSGzipBytes: 72 * 1024,
    initialCSSGzipBytes: 6 * 1024,
    totalJSGzipBytes: 130 * 1024,
    totalCSSGzipBytes: 8 * 1024,
    entries: {
      "src/pages/A.tsx": { jsGzipBytes: 12 * 1024, cssGzipBytes: 1024 },
    },
  };
}

test("normal small UI changes do not fail on a few bytes", () => {
  const base = report(),
    next = report();
  next.initialJSGzipBytes += 1500;
  next.initialCSSGzipBytes += 300;
  next.entries["src/pages/A.tsx"].jsGzipBytes += 2048;
  assert.deepEqual(evaluate(next, base).errors, []);
});

test("adding unrelated lazy features does not consume a shared global quota", () => {
  const base = report(),
    next = report();
  next.totalJSGzipBytes += 200 * 1024;
  next.totalCSSGzipBytes += 10 * 1024;
  for (let i = 0; i < 20; i++)
    next.entries[`src/pages/New${i}.tsx`] = {
      jsGzipBytes: 10 * 1024,
      cssGzipBytes: 512,
    };
  const result = evaluate(next, base);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((s) => s.includes("Total JS trend")));
});

test("absolute initial JS and CSS budgets are enforced without a baseline", () => {
  const next = report();
  next.initialJSGzipBytes = limits.initialJSGzipBytes + 1;
  next.initialCSSGzipBytes = limits.initialCSSGzipBytes + 1;
  assert.equal(evaluate(next).errors.length, 2);
});

test("every lazy entry includes its shared dependencies in its own hard budget", () => {
  const next = report();
  next.entries["new feature"] = {
    jsGzipBytes: limits.entryJSGzipBytes + 1,
    cssGzipBytes: limits.entryCSSGzipBytes + 1,
  };
  assert.ok(evaluate(next).errors.every((s) => s.includes("new feature")));
  assert.equal(evaluate(next).errors.length, 2);
});

test("large initial regressions fail even before the absolute ceiling", () => {
  const base = report(),
    next = report();
  next.initialJSGzipBytes += 12 * 1024;
  assert.ok(next.initialJSGzipBytes < limits.initialJSGzipBytes);
  assert.ok(
    evaluate(next, base).errors.some((s) => s.includes("Initial JS growth")),
  );
});

test("large initial CSS regressions require review even below the absolute ceiling", () => {
  const base = report(),
    next = report();
  next.initialCSSGzipBytes += 3 * 1024;
  assert.ok(next.initialCSSGzipBytes < limits.initialCSSGzipBytes);
  assert.ok(
    evaluate(next, base).errors.some((s) => s.includes("Initial CSS growth")),
  );
});

test("module-specific regressions name the module and the increase", () => {
  const base = report(),
    next = report();
  next.entries["src/pages/A.tsx"].jsGzipBytes += 9 * 1024;
  assert.match(
    evaluate(next, base).errors[0],
    /src\/pages\/A.tsx JS growth: \+9.00 KiB/,
  );
});

test("eagerly loading a previously lazy page is blocked", () => {
  const next = report();
  next.entries["src/pages/A.tsx"].eagerlyLoaded = true;
  assert.ok(evaluate(next).errors.some((s) => s.includes("initial bundle")));
});

test("warning bands do not turn normal growth into a failing build", () => {
  const next = report();
  next.initialJSGzipBytes = limits.initialJSGzipBytes * 0.9;
  const result = evaluate(next);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.length);
});
