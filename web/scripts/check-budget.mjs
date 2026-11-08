import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { collectBundle } from "./budget/graph.mjs";
import { evaluate, limits } from "./budget/policy.mjs";
import {
  makeBaseline,
  readBaseline,
  writeBaseline,
} from "./budget/baseline.mjs";
import { markdown, printSummary } from "./budget/report.mjs";

try {
  const { values } = parseArgs({
    options: {
      "update-baseline": { type: "boolean", default: false },
      reason: { type: "string" },
    },
  });
  const reason = values.reason?.trim();
  if (
    values["update-baseline"] &&
    (!reason || reason.length < 8 || reason.length > 500)
  ) {
    throw new Error(
      "Updating the baseline requires --reason with 8 to 500 characters",
    );
  }
  const root = path.resolve("dist"),
    file = path.resolve("bundle-baseline.json");
  const baseline = readBaseline(file, values["update-baseline"]);
  const bundle = collectBundle(root);
  const result = evaluate(
    bundle,
    values["update-baseline"] ? undefined : baseline,
  );
  const report = {
    ...bundle,
    ...result,
    limits,
    baselineRevision: baseline?.revision || null,
  };
  fs.writeFileSync(
    path.join(root, "budget.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  fs.writeFileSync(path.join(root, "budget.md"), markdown(report, baseline));
  printSummary(report);
  if (result.errors.length)
    throw new Error(
      "Bundle budget exceeded; see the metrics and asset names above",
    );
  if (values["update-baseline"]) {
    writeBaseline(file, makeBaseline(bundle, reason, process.cwd()));
    console.log(`Baseline updated explicitly: ${reason}`);
  }
  console.log(
    "Web performance budget passed. Reports: dist/budget.json, dist/budget.md",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
