import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([
  "node_modules",
  ".git",
  ".runtime",
  "out",
  "dist",
  "miniprogram_npm",
  "test-results",
  "playwright-report",
]);
const extensions = new Set([
  ".ts",
  ".tsx",
  ".go",
  ".css",
  ".wxss",
  ".wxml",
  ".mjs",
  ".cjs",
]);
const violations = [];
let largest = { lines: 0, file: "" },
  count = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(e.name)) continue;
    const file = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(file);
      continue;
    }
    if (!extensions.has(path.extname(file))) continue;
    count++;
    const source = fs.readFileSync(file, "utf8");
    const lines = source.trimEnd().split(/\r?\n/).length;
    const relative = path.relative(root, file);
    if (lines > largest.lines) largest = { lines, file: relative };
    if (lines > 300) violations.push(`${relative}: ${lines} lines (limit 300)`);
  }
}
walk(root);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(
  `Structure: ${count} source files; largest ${largest.file}: ${largest.lines} lines.`,
);
