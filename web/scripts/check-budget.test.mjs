import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture, randomCode } from "./budget/fixtures.mjs";
import { writeBaseline } from "./budget/baseline.mjs";

test("normal builds emit readable reports and never rewrite the baseline", (t) => {
  const f = fixture(t);
  f.baseline();
  const baseline = fs.readFileSync(
    path.join(f.dir, "bundle-baseline.json"),
    "utf8",
  );
  const run = f.run();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(
    fs.readFileSync(path.join(f.dir, "bundle-baseline.json"), "utf8"),
    baseline,
  );
  assert.match(
    fs.readFileSync(path.join(f.dir, "dist/budget.md"), "utf8"),
    /Additional assets/,
  );
  assert.ok(
    JSON.parse(fs.readFileSync(path.join(f.dir, "dist/budget.json"), "utf8"))
      .entries["src/pages/A.tsx"],
  );
});

test("missing baselines fail closed without silently initializing one", (t) => {
  const f = fixture(t),
    run = f.run();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Missing bundle baseline/);
  assert.equal(fs.existsSync(path.join(f.dir, "bundle-baseline.json")), false);
});

test("explicit baseline changes need a review reason", (t) => {
  const f = fixture(t),
    run = f.run("--update-baseline");
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /requires --reason/);
  assert.equal(fs.existsSync(path.join(f.dir, "bundle-baseline.json")), false);
});

test("a reviewed update records new metrics and can replace an existing baseline", (t) => {
  const f = fixture(t),
    reason = "Add reviewed lazy settings editor";
  let run = f.run("--update-baseline", "--reason", reason);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  let baseline = JSON.parse(
    fs.readFileSync(path.join(f.dir, "bundle-baseline.json"), "utf8"),
  );
  assert.equal(baseline.reason, reason);
  f.write("dist/assets/A-hash.js", randomCode(12000));
  run = f.run(
    "--update-baseline",
    "--reason",
    "Reviewed larger settings form and verified browser loading",
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const updated = JSON.parse(
    fs.readFileSync(path.join(f.dir, "bundle-baseline.json"), "utf8"),
  );
  assert.ok(
    updated.entries["src/pages/A.tsx"].jsGzipBytes >
      baseline.entries["src/pages/A.tsx"].jsGzipBytes,
  );
});

test("reviewed baseline updates cannot override absolute performance ceilings", (t) => {
  const f = fixture(t);
  f.baseline();
  const before = fs.readFileSync(
    path.join(f.dir, "bundle-baseline.json"),
    "utf8",
  );
  f.write("dist/assets/index.js", randomCode(150000));
  const run = f.run(
    "--update-baseline",
    "--reason",
    "Attempt to approve excessive initial code",
  );
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Initial JS/);
  assert.equal(
    fs.readFileSync(path.join(f.dir, "bundle-baseline.json"), "utf8"),
    before,
  );
});

test("large regressions fail with module details and still write both reports", (t) => {
  const f = fixture(t);
  f.baseline();
  f.write("dist/assets/A-hash.js", randomCode(18000));
  const run = f.run();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /src\/pages\/A.tsx JS growth/);
  assert.match(run.stderr, /assets\/A-hash.js/);
  const report = JSON.parse(
    fs.readFileSync(path.join(f.dir, "dist/budget.json"), "utf8"),
  );
  assert.ok(report.errors.length);
  assert.match(
    fs.readFileSync(path.join(f.dir, "dist/budget.md"), "utf8"),
    /ERROR/,
  );
});

test("new lazy pages do not fail because a global sum exceeded the old quota", (t) => {
  const f = fixture(t);
  f.baseline();
  for (let i = 0; i < 15; i++) {
    const file = `assets/New${i}.js`,
      key = `src/pages/New${i}.tsx`;
    f.manifest[key] = {
      file,
      src: key,
      isDynamicEntry: true,
      imports: ["common"],
    };
    f.write("dist/" + file, randomCode(12000));
  }
  f.saveManifest();
  const run = f.run();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /Total JS trend/);
});

test("invalid baseline metrics cannot disable growth protection", (t) => {
  const f = fixture(t);
  f.baseline();
  const file = path.join(f.dir, "bundle-baseline.json"),
    baseline = JSON.parse(fs.readFileSync(file, "utf8"));
  baseline.initialJSGzipBytes = "unlimited";
  f.write("bundle-baseline.json", JSON.stringify(baseline));
  assert.match(f.run().stderr, /Invalid bundle baseline/);
});

test("failed atomic writes do not delete an existing temporary file", (t) => {
  const f = fixture(t),
    file = path.join(f.dir, "bundle-baseline.json");
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, "keep-existing-file");
  assert.throws(
    () => writeBaseline(file, { reason: "reviewed fixture" }),
    /EEXIST/,
  );
  assert.equal(fs.readFileSync(temporary, "utf8"), "keep-existing-file");
});

test("corrupt or null baseline JSON produces an explicit configuration error", (t) => {
  const f = fixture(t);
  for (const content of ["{invalid", "null"]) {
    f.write("bundle-baseline.json", content);
    const run = f.run();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Invalid bundle baseline/);
  }
});
