import { expect, test } from "@playwright/test";
import { codes, openCodes, titles } from "./provider-code-fixture";

for (const leave of ["close", "tab"] as const) {
  test(`a late review read cannot open a confirmation after ${leave}`, async ({
    page,
  }) => {
    const { dialog } = await openCodes(page, "branch", false, true);
    let release!: () => void,
      arrived = false,
      completed = false,
      writes = 0;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/code-provider/code-uses?*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "use",
              version: 1,
              data: {
                userId: "waiting-user",
                name: "待开通用户",
                code: codes.s1,
                role: "s1",
                status: "pending",
              },
            },
          ],
          page: 1,
          total: 1,
        },
      }),
    );
    await page.route(
      "**/api/admin/registrations/waiting-user",
      async (route) => {
        if (route.request().method() === "PUT") writes++;
        arrived = true;
        await pending;
        await route
          .fulfill({
            json: {
              id: "waiting-user",
              version: 2,
              data: {
                role: "s1",
                code: codes.s1,
                name: "待开通用户",
                status: "pending",
              },
            },
          })
          .catch(() => {
            /* The originating view aborted this read. */
          });
        completed = true;
      },
    );
    const records = dialog.getByRole("region", {
      name: "扫码登记记录",
      exact: true,
    });
    await records.getByRole("button", { name: "刷新扫码记录" }).click();
    await records.getByRole("button", { name: "开通", exact: true }).click();
    await expect.poll(() => arrived).toBe(true);
    if (leave === "close")
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    else
      await dialog.getByRole("tab", { name: titles.s2, exact: true }).click();
    release();
    await expect.poll(() => completed).toBe(true);
    await expect(
      page.getByRole("dialog", { name: "开通登记", exact: true }),
    ).toHaveCount(0);
    expect(writes).toBe(0);
  });
}

test("a confirmed review blocks navigation until its write finishes", async ({
  page,
}) => {
  const { dialog } = await openCodes(page, "branch", true);
  let release!: () => void,
    arrived = false,
    completed = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/users?*", (route) =>
    route.fulfill({ json: { items: [], page: 1, total: 0 } }),
  );
  await page.route("**/code-provider/code-uses?*", (route) => {
    const bind =
      new URL(route.request().url()).searchParams.get("kind") === "bind";
    return route.fulfill({
      json: {
        items: bind
          ? [
              {
                id: "use",
                version: 1,
                data: {
                  userId: "owner-user",
                  name: "分公司负责人",
                  code: codes.bind,
                  role: "branch",
                  status: "pending",
                },
              },
            ]
          : [],
        page: 1,
        total: bind ? 1 : 0,
      },
    });
  });
  await page.route("**/api/admin/registrations/owner-user", async (route) => {
    if (route.request().method() === "PUT") {
      arrived = true;
      await pending;
    }
    await route.fulfill({
      json: {
        id: "owner-user",
        version: 2,
        data: {
          role: "branch",
          name: "分公司负责人",
          status: "pending",
          code: codes.bind,
        },
      },
    });
    if (route.request().method() === "PUT") completed = true;
  });
  await dialog.locator(".owner-bind > summary").click();
  await dialog
    .locator(".owner-bind")
    .getByRole("button", { name: "开通", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "开通登记", exact: true })
    .getByRole("button", { name: "开通", exact: true })
    .click();
  await expect.poll(() => arrived).toBe(true);
  await page.evaluate(() => {
    location.hash = "users";
  });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#partners");
  const confirmation = page.getByRole("dialog", {
    name: "开通登记",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "取消", exact: true }),
  ).toBeDisabled();
  release();
  await expect.poll(() => completed).toBe(true);
  await expect(
    page.getByRole("dialog", { name: "开通登记", exact: true }),
  ).toHaveCount(0);
  await expect(dialog).toBeVisible();
});
