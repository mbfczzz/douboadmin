import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("generation paging and search are server queries", async ({ page }) => {
  await mockLogin(page);
  const calls: URL[] = [];
  await page.route("**/api/admin/jobs?*", (route) => {
    const url = new URL(route.request().url());
    calls.push(url);
    const number = Number(url.searchParams.get("page"));
    return route.fulfill({
      json: {
        page: number,
        size: 20,
        total: 205,
        items: [
          {
            id: `job-page-${number}`,
            userId: "qa-user",
            status: "succeeded",
            progress: 100,
            input: { kind: "image", prompt: `page ${number} prompt` },
            createdAt: "2026-11-10T00:00:00Z",
          },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("page 1 prompt");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("page 2 prompt");
  expect(calls.at(-1)?.searchParams.get("page")).toBe("2");
  await page.getByPlaceholder("搜索提示词或任务编号").fill("old model");
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("q"))
    .toBe("old model");
  expect(calls.at(-1)?.searchParams.get("page")).toBe("1");
});

test("works apply filters on the server before paginating", async ({
  page,
}) => {
  await mockLogin(page);
  const calls: URL[] = [];
  await page.route("**/api/admin/works?*", (route) => {
    const url = new URL(route.request().url());
    calls.push(url);
    return route.fulfill({
      json: {
        page: Number(url.searchParams.get("page")),
        size: 20,
        total: 500,
        items: [],
      },
    });
  });
  await page.getByRole("button", { name: "作品管理", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect.poll(() => calls.at(-1)?.searchParams.get("page")).toBe("2");
  await page.getByLabel("作品状态", { exact: true }).selectOption("deleted");
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("deleted"))
    .toBe("deleted");
  expect(calls.at(-1)?.searchParams.get("page")).toBe("1");
});
