import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  confirmSubmission,
  login,
  answerAsk,
  usersList,
  usersPage,
} from "./helpers";

test("cover upload locks its URL and restores editing on failure", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "创作模板", exact: true }).click();
  await page.getByRole("button", { name: "新增视频模板", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    url = dialog.getByLabel("模板封面", { exact: true });
  await url.fill("/media/design/cover-1.jpg");
  let release!: () => void,
    started = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/assets?purpose=cover", async (route) => {
    started = true;
    await pending;
    await route.fulfill({ status: 503, json: { error: "测试上传失败" } });
  });
  await dialog.getByLabel("上传封面", { exact: true }).setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: readFileSync("../media/design/cover-1.jpg"),
  });
  await expect.poll(() => started).toBeTruthy();
  try {
    await expect(url).toBeDisabled();
  } finally {
    release();
  }
  await expect(dialog.getByRole("alert")).toContainText("测试上传失败");
  await expect(url).toBeEnabled();
  await expect(url).toHaveValue("/media/design/cover-1.jpg");
});

test("collapsed account actions do not trap keyboard focus", async ({
  page,
}) => {
  await login(page);
  await page.route(usersList, (route) =>
    route.fulfill({
      json: usersPage(route.request().url(), [
        {
          id: "focus-user",
          version: 1,
          createdAt: "2026-11-01T00:00:00Z",
          data: { nickname: "键盘验收" },
        },
      ]),
    }),
  );
  await page.route("**/api/admin/users/focus-user/wallet", (route) =>
    route.fulfill({ json: { wallet: { availableUnits: 100, heldUnits: 0 } } }),
  );
  await page.route("**/api/admin/users/focus-user/ledger?*", (route) =>
    route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } }),
  );
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByRole("button", { name: "停用", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    close = dialog.getByRole("button", { name: "关闭", exact: true }),
    confirm = dialog.getByRole("button", { name: "停用账号", exact: true });
  // Focus wraps between the last action and the close button.
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
});

test("long error notifications remain inside a mobile viewport", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/admin/models/sync", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "upstream_error_" + "x".repeat(240) },
    }),
  );
  await page.getByRole("button", { name: "同步上游", exact: true }).click();
  await confirmSubmission(page);
  const toast = page.locator(".toast");
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(378);
  expect(
    await toast.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
});

test("an unresponsive cover upload can be cancelled without affecting the next editor", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "创作模板", exact: true }).click();
  await page.getByRole("button", { name: "新增视频模板", exact: true }).click();
  let release!: () => void,
    started = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/assets?purpose=cover", async (route) => {
    started = true;
    await pending;
    await route.fulfill({
      json: { id: "late-cover", data: { url: "/media/design/cover-1.jpg" } },
    });
  });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("上传封面", { exact: true }).setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: readFileSync("../media/design/cover-1.jpg"),
  });
  await expect.poll(() => started).toBeTruthy();
  try {
    const cancel = dialog.getByRole("button", { name: "取消", exact: true });
    await expect(cancel).toBeEnabled();
    await cancel.click();
    await answerAsk(page, true);
    await expect(dialog).toHaveCount(0);
  } finally {
    release();
  }
  await page.getByRole("button", { name: "新增视频模板", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("模板封面", { exact: true }),
  ).toHaveValue("");
});
