const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness } = require("./harness.cjs");

// Points are taken when a task is submitted and returned if it fails; users
// never see a separate "预留 / 冻结 / 结算" step.
test("ledger rows read as 扣除 and 退回", () => {
  const { ledgerView } = harness().service("wallet-ledger");
  const row = (kind, availableDelta) => ({ id: kind, createdAt: "2026-11-19T00:00:00Z", data: { kind, availableDelta, heldDelta: 0, note: "任务" } });
  assert.deepEqual([ledgerView(row("job_hold", -500)).title, ledgerView(row("job_hold", -500)).change], ["生成扣除", "-5"]);
  const back = ledgerView(row("job_release", 300));
  assert.deepEqual([back.title, back.change, back.tone], ["失败退回", "+3", "plus"]);
});

test("no user-facing reserve wording remains", () => {
  const roots = ["pages", "components", "services", "utils"];
  const files = roots.flatMap((dir) => fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)))
    .filter((f) => /\.(ts|wxml)$/.test(f));
  for (const file of files) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /预留|冻结/, file);
});
