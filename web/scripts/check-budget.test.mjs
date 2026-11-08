import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

const project = fileURLToPath(new URL("../../", import.meta.url));
const runtime = path.join(project, ".runtime");
fs.mkdirSync(runtime, { recursive: true });
const checker = fileURLToPath(new URL("check-budget.mjs", import.meta.url));
const routes = [
  "Orders",
  "Payments",
  "Works",
  "Reviews",
  "Monitor",
  "AdminAccounts",
  "Overview",
  "Workspace",
  "CommandPalette",
  "Users",
  "partner-business",
];

function fixture(t, imports, code = "export default 1;", overrides = {}) {
  const dir = fs.mkdtempSync(path.join(runtime, "budget-check-"));
  t.after(() => {
    if (!path.resolve(dir).startsWith(path.resolve(runtime) + path.sep))
      throw new Error("Unexpected test directory");
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(dir, "dist/assets"), { recursive: true });
  fs.mkdirSync(path.join(dir, "dist/.vite"), { recursive: true });
  const files = {
    "assets/index.js": code,
    "assets/common.js": "export const common = 1;",
    "assets/other.js": "export const other = 1;",
    ...Object.fromEntries(
      routes.map((r) => [`assets/${r}-fixture.js`, "export default 1;"]),
    ),
  };
  for (const [name, source] of Object.entries(files))
    fs.writeFileSync(path.join(dir, "dist", name), source);
  const manifest = {
    "index.html": { file: "assets/index.js", imports },
    common: { file: "assets/common.js", imports: ["index.html"] },
    other: { file: "assets/other.js", imports: ["common"] },
  };
  fs.writeFileSync(
    path.join(dir, "dist/.vite/manifest.json"),
    JSON.stringify({ ...manifest, ...overrides }),
  );
  const run = spawnSync(process.execPath, [checker], {
    cwd: dir,
    encoding: "utf8",
    timeout: 5000,
  });
  return { dir, run, files };
}

test("manifest cycles terminate and each initial asset is counted once", (t) => {
  const { dir, run, files } = fixture(t, ["common"]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const report = JSON.parse(
    fs.readFileSync(path.join(dir, "dist/budget.json"), "utf8"),
  );
  assert.equal(
    report.initialJSBytes,
    Buffer.byteLength(files["assets/index.js"] + files["assets/common.js"]),
  );
});

test("repeated shared dependencies do not change initial size totals", (t) => {
  const { dir, run, files } = fixture(t, ["common", "other", "common"]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const report = JSON.parse(
    fs.readFileSync(path.join(dir, "dist/budget.json"), "utf8"),
  );
  assert.equal(
    report.initialJSBytes,
    Buffer.byteLength(
      files["assets/index.js"] +
        files["assets/common.js"] +
        files["assets/other.js"],
    ),
  );
});

test("cyclic manifests still reject bundles above the unchanged limits", (t) => {
  const { run } = fixture(
    t,
    ["common"],
    "export default " + JSON.stringify(randomBytes(150000).toString("base64")),
  );
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Bundle budget exceeded/);
});

test("aliases of one file still include every declared dependency", (t) => {
  const { dir, run, files } = fixture(
    t,
    ["common", "alias"],
    "export default 1;",
    {
      alias: { file: "assets/common.js", imports: ["other"] },
    },
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const report = JSON.parse(
    fs.readFileSync(path.join(dir, "dist/budget.json"), "utf8"),
  );
  assert.equal(
    report.initialJSBytes,
    Buffer.byteLength(
      files["assets/index.js"] +
        files["assets/common.js"] +
        files["assets/other.js"],
    ),
  );
});
