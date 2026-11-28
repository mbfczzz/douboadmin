import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

// 作品管理 marks a work WeChat's 内容安全 took down, and lists such works.
test("a work taken down by WeChat is marked and filtered in 作品管理", async ({
  page,
}) => {
  await mockLogin(page);
  const queries: string[] = [];
  const work = (id: string, blocked: boolean) => ({
    id,
    userId: "user-one",
    userName: "小王",
    status: "succeeded",
    progress: 100,
    input: { kind: "image", prompt: `作品${id}`, model: "m", assets: [] },
    createdAt: "2026-11-11T01:00:00Z",
    updatedAt: "2026-11-11T01:00:00Z",
    result: "https://fixture.test/a.jpg",
    ...(blocked ? { blocked: true, blockReason: "色情" } : {}),
  });
  await page.route(/\/api\/admin\/works\?/, (r) => {
    const deleted = new URL(r.request().url()).searchParams.get("deleted");
    queries.push(deleted || "");
    const items =
      deleted === "blocked"
        ? [work("b", true)]
        : [work("a", false), work("b", true)];
    return r.fulfill({
      json: { items, total: items.length, page: 1, size: 20 },
    });
  });
  await page.getByRole("button", { name: "作品管理", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "作品b" });
  await expect(row.getByText("违规下架", { exact: true })).toBeVisible();
  await expect(row.getByText("微信判定：色情，已停止对外展示")).toBeVisible();
  await expect(row.getByRole("button", { name: "设为优秀" })).toBeDisabled();
  await expect(
    page.getByRole("row").filter({ hasText: "作品a" }).getByText("正常"),
  ).toBeVisible();
  await page.getByLabel("作品状态").selectOption("blocked");
  await expect.poll(() => queries.at(-1)).toBe("blocked");
  await expect(page.getByRole("row").filter({ hasText: "作品a" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "../.runtime/works-blocked.png",
    fullPage: true,
  });
});

// 日志管理 → 内容安全: a refused submission stands out with what and why.
test("a refusal by WeChat stands out in the 内容安全 log", async ({ page }) => {
  await mockLogin(page);
  let tab = "";
  await page.route(/\/api\/admin\/audit\?/, (r) => {
    tab = new URL(r.request().url()).searchParams.get("tab") || "";
    const items =
      tab === "security"
        ? [
            {
              id: "01JSEC",
              at: "2026-11-29T01:00:00Z",
              category: "security",
              action: "文本内容安全检测",
              actorType: "user",
              actorId: "user-one",
              actorName: "小王",
              method: "POST",
              route: "微信内容安全 /wxa/msg_sec_check",
              path: "/wxa/msg_sec_check",
              status: 200,
              durationMs: 120,
              summary: "违规 · 色情",
              error: "微信判定违规（色情），已拦截「提交生成任务」",
            },
          ]
        : [];
    return r.fulfill({ json: { items } });
  });
  await page.getByRole("button", { name: "日志管理", exact: true }).click();
  await page.getByRole("tab", { name: "内容安全", exact: true }).click();
  await expect.poll(() => tab).toBe("security");
  await expect(
    page.getByText("微信判定违规（色情），已拦截「提交生成任务」"),
  ).toBeVisible();
  await expect(page.getByText("已拦截", { exact: true })).toBeVisible();
  await page.getByLabel("结果").selectOption("fail");
  await expect(
    page.getByRole("option", { name: "已拦截或调用失败" }),
  ).toBeAttached();
  await page.screenshot({
    path: "../.runtime/security-log.png",
    fullPage: true,
  });
});
