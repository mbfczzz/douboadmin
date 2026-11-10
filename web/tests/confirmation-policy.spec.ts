import { test, expect } from "@playwright/test";
import { confirmationPlan, needsConfirmation } from "../src/confirmation/plan";

test("all existing configuration and profile updates require approval, creations are exempt", () => {
  for (const path of [
    "/admin/integrations/virtual",
    "/admin/partner-policy",
    "/admin/users/u",
    "/admin/accounts/a/password",
    "/admin/models/m",
    "/admin/templates/t",
    "/admin/memberships/u",
  ])
    expect(needsConfirmation(path, "PUT", { version: 1 })).toBe(true);
  expect(
    needsConfirmation("/admin/integrations/wechat", "PUT", { version: 0 }),
  ).toBe(true);
  for (const path of ["/admin/models/m", "/admin/templates/t"])
    expect(needsConfirmation(path, "PUT", { version: 0 })).toBe(false);
  expect(needsConfirmation("/admin/accounts", "POST", {})).toBe(false);
  expect(needsConfirmation("/admin/assets", "POST", {})).toBe(false);
  for (const path of [
    "/admin/users/u/wallet",
    "/admin/orders/o/refund",
    "/admin/virtual-payments/events/e/review",
    "/admin/commission-payouts",
  ])
    expect(needsConfirmation(path, "POST", {})).toBe(true);
});

test("confirmation summarizes only changed fields and redacts nested secrets and cleared credentials", () => {
  const plan = confirmationPlan(
    "/admin/users/u",
    {
      version: 1,
      name: "new",
      phone: "same",
      password: "private-value",
      nested: { apiKey: "nested-secret" },
    },
    { before: { name: "old", phone: "same", password: "old-secret" } },
  );
  expect(plan.rows.some((row) => row.label === "手机号")).toBe(false);
  const serialized = JSON.stringify(plan);
  for (const secret of ["private-value", "nested-secret", "old-secret"])
    expect(serialized).not.toContain(secret);
  expect(serialized).toContain("内容隐藏");
  const clear = confirmationPlan(
    "/admin/integrations/wechat",
    { values: { WECHAT_APP_SECRET: "" }, clear: ["WECHAT_APP_SECRET"] },
    { before: { WECHAT_APP_SECRET: "private" } },
  );
  expect(clear.rows[0].after).toBe("清除");
  expect(
    confirmationPlan(
      "/admin/integrations/wechat",
      { values: { WECHAT_APP_SECRET: "" } },
      { before: { WECHAT_APP_SECRET: "private" } },
    ).rows,
  ).toHaveLength(0);
});
