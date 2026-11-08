import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { collectBundle } from "./graph.mjs";
import { makeBaseline } from "./baseline.mjs";

const runtime = fileURLToPath(new URL("../../../.runtime/", import.meta.url));
const checker = fileURLToPath(new URL("../check-budget.mjs", import.meta.url));

export const randomCode = (bytes) =>
  "export default " + JSON.stringify(randomBytes(bytes).toString("base64"));

export function fixture(t, extraManifest = {}, extraFiles = {}) {
  fs.mkdirSync(runtime, { recursive: true });
  const dir = fs.mkdtempSync(path.join(runtime, "performance-budget-"));
  t.after(() => {
    if (!path.resolve(dir).startsWith(path.resolve(runtime) + path.sep))
      throw new Error("Unexpected fixture path");
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const manifest = {
    "index.html": {
      file: "assets/index.js",
      imports: ["common"],
      css: ["assets/base.css"],
    },
    common: { file: "assets/common.js", imports: ["index.html"] },
    "src/pages/A.tsx": {
      file: "assets/A-hash.js",
      src: "src/pages/A.tsx",
      isDynamicEntry: true,
      imports: ["common"],
      css: ["assets/A.css"],
    },
    ...extraManifest,
  };
  const files = {
    "assets/index.js": "export default 1;",
    "assets/common.js": "export const shared=1;",
    "assets/base.css": "body{color:black}",
    "assets/A-hash.js": "export default function A(){}",
    "assets/A.css": ".page{color:green}",
    ...extraFiles,
  };
  function write(file, content) {
    const target = path.resolve(dir, file);
    if (!target.startsWith(dir + path.sep))
      throw new Error("Unexpected fixture file");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  for (const [file, content] of Object.entries(files))
    write("dist/" + file, content);
  const saveManifest = () =>
    write("dist/.vite/manifest.json", JSON.stringify(manifest));
  saveManifest();
  const report = () => collectBundle(path.join(dir, "dist"));
  const baseline = () =>
    write(
      "bundle-baseline.json",
      JSON.stringify(makeBaseline(report(), "Test baseline fixture", dir)),
    );
  const run = (...args) =>
    spawnSync(process.execPath, [checker, ...args], {
      cwd: dir,
      encoding: "utf8",
      timeout: 5000,
    });
  return { dir, manifest, files, write, saveManifest, report, baseline, run };
}
