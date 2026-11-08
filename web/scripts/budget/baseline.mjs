import fs from "node:fs";
import { execFileSync } from "node:child_process";

const metrics = [
  "initialJSGzipBytes",
  "initialCSSGzipBytes",
  "totalJSGzipBytes",
  "totalCSSGzipBytes",
];
const validSize = (n) => Number.isSafeInteger(n) && n >= 0;

export function readBaseline(file, optional = false) {
  if (!fs.existsSync(file)) {
    if (optional) return undefined;
    throw new Error(
      'Missing bundle baseline. Use npm run budget:baseline -- --reason "reason" to create it explicitly.',
    );
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error("Invalid bundle baseline JSON");
  }
  if (
    !value ||
    value.schemaVersion !== 2 ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    !value.entries ||
    typeof value.entries !== "object" ||
    Array.isArray(value.entries) ||
    metrics.some((key) => !validSize(value[key]))
  )
    throw new Error("Invalid bundle baseline");
  for (const entry of Object.values(value.entries)) {
    if (
      !entry ||
      !validSize(entry.jsGzipBytes) ||
      !validSize(entry.cssGzipBytes)
    )
      throw new Error("Invalid baseline entry");
  }
  return value;
}

export function makeBaseline(report, reason, cwd) {
  let revision = "unknown";
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* Source archives can be built without Git metadata. */
  }
  return {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    revision,
    reason,
    ...Object.fromEntries(metrics.map((key) => [key, report[key]])),
    entries: Object.fromEntries(
      Object.entries(report.entries).map(([name, entry]) => [
        name,
        {
          jsGzipBytes: entry.jsGzipBytes,
          cssGzipBytes: entry.cssGzipBytes,
        },
      ]),
    ),
  };
}

export function writeBaseline(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  let created = false;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
    created = true;
    fs.renameSync(temporary, file);
  } finally {
    if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
