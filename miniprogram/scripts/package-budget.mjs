import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDependencies } from "./dependencies.mjs";
import { sourceBytes } from "./source-bytes.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = collectDependencies(root);
const sum = (files) => files.reduce((n, p) => n + sourceBytes(p), 0);
const vendor = graph.files.filter((p) =>
  p.includes(path.sep + "node_modules" + path.sep),
);
const report = {
  applicationSourceBytes: sum(graph.files.filter((p) => !vendor.includes(p))),
  referencedVendorSourceBytes: sum(vendor),
  referencedSourceBytes: sum(graph.files),
  onDiskSourceBytes: graph.files.reduce((n, p) => n + fs.statSync(p).size, 0),
  files: graph.files.length,
  packages: graph.packages,
  externalResources: graph.external.length,
};
console.log(
  "Mini-program LF-normalized referenced source estimate (NOT final WeChat package):",
  JSON.stringify(report),
);
// 512 KiB at launch. Raised to 544 KiB in Nov 2026 for intentional growth:
// SMS two-step registration (536.8 KB at that commit), then scan
// registration with the provider centre, 推广码 and profile identity
// (548.3 KB). Not a ceiling to drift up to: the WeChat upload package is
// still checked separately in the developer tools.
// Reviewed feature increment: awaiting-approval browsing, +139 source bytes
// after consolidating response parsing. See docs/miniprogram-browse-budget.md.
// Explicit feature allowance: native @ reference selection and preview,
// measured +2.6 KiB with no new SDK components. See the feature budget note.
// Reviewed UI v4 feature increment: real recent-work previews, responsive SKU
// selection, richer order states and editor actions. See docs/miniprogram-ui-v4-budget.md.
// Phone authorization login adds a shared grant handler and native entry points;
// see docs/wechat-phone-login.md for the measured feature delta.
// UI review fixes (video covers, empty states, menu layout): +2,462 bytes,
// see docs/miniprogram-ui-review-fixes.md.
const budget = 565 * 1024;
if (report.referencedSourceBytes > budget)
  throw new Error(`Referenced source budget exceeded (${budget / 1024} KiB).`);
const out = path.resolve(root, "../.runtime");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "miniprogram-budget.json"),
  JSON.stringify(report, null, 2),
);
