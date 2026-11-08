import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

try {
  const { values } = parseArgs({ options: { reason: { type: "string" } } });
  const reason = values.reason?.trim();
  if (!reason || reason.length < 8 || reason.length > 500)
    throw new Error("Provide --reason with 8 to 500 characters");
  if (!process.env.npm_execpath)
    throw new Error('Use npm run budget:baseline -- --reason "reason"');
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  function run(args) {
    const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
  // Pass an argument array: review reasons never become shell commands.
  run([process.env.npm_execpath, "run", "build:assets"]);
  run([
    path.join(cwd, "scripts/check-budget.mjs"),
    "--update-baseline",
    "--reason",
    reason,
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
