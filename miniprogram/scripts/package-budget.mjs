import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDependencies } from "./dependencies.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = collectDependencies(root);
const sum = (files) => files.reduce((n, p) => n + fs.statSync(p).size, 0);
const vendor = graph.files.filter((p) =>
  p.includes(path.sep + "node_modules" + path.sep),
);
const report = {
  applicationSourceBytes: sum(graph.files.filter((p) => !vendor.includes(p))),
  referencedVendorSourceBytes: sum(vendor),
  referencedSourceBytes: sum(graph.files),
  files: graph.files.length,
  packages: graph.packages,
  externalResources: graph.external.length,
};
console.log(
  "Mini-program referenced source estimate (NOT final WeChat package):",
  JSON.stringify(report),
);
if (report.referencedSourceBytes > 512 * 1024)
  throw new Error("Referenced source budget exceeded (512 KiB).");
const out = path.resolve(root, "../.runtime");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "miniprogram-budget.json"),
  JSON.stringify(report, null, 2),
);
