import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("failed jobs offer detail and refund as separate row actions", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/admin/jobs/qa-job/*", (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    posts.push({
      path: new URL(request.url()).pathname,
      body: request.postDataJSON(),
    });
    return route.fulfill({ json: {} });
  });
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  const row = page.locator("tbody tr").first();
  await expect(row.getByRole("button")).toHaveText([/详情/, "退回积分"]);

  // The detail dialog is read-only.
  await row.getByRole("button", { name: /详情/ }).click();
  const detail = page.getByRole("dialog", { name: "生成记录详情" });
  await expect(detail.getByText("界面异常展示样例")).toBeVisible();
  await expect(detail.getByText("图片 1")).toBeVisible();
  await expect(detail.getByRole("button", { name: /恢复|退回/ })).toHaveCount(
    0,
  );
  await detail.getByRole("button", { name: "关闭", exact: true }).click();

  await row.getByRole("button", { name: "退回积分", exact: true }).click();
  const release = page.getByRole("dialog", { name: "核实后退回积分" });
  await release.getByLabel("处理原因").fill("短");
  await expect(
    release.getByRole("button", { name: "退回积分", exact: true }),
  ).toBeDisabled();
  await release.getByLabel("处理原因").fill("已核实上游未出图");
  await release.getByRole("button", { name: "退回积分", exact: true }).click();
  const approval = page.getByRole("dialog", { name: "确认退回积分" });
  await expect(approval).toContainText("已核实上游未交付");
  await expect(approval).not.toContainText("verified");
  await confirmSubmission(page);
  await expect(release).toHaveCount(0);
  expect(posts).toEqual([
    {
      path: "/api/admin/jobs/qa-job/release",
      body: { verified: true, reason: "已核实上游未出图" },
    },
  ]);
});
