import { test, expect } from "@playwright/test";
import { openCodes, titles, codes } from "./provider-code-fixture";

for (const width of [1440, 390, 320]) {
  test(`a branch has three distinct business codes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { dialog, requests } = await openCodes(page);
    await expect(dialog.getByRole("tab")).toHaveText(Object.values(titles));
    await expect(dialog.locator(".share-code")).toHaveText("KMNP-2345");
    expect(requests).toEqual(["GET:s1"]);
    for (const kind of ["s2", "member"] as const) {
      await dialog
        .getByRole("tab", { name: titles[kind], exact: true })
        .click();
      await expect(dialog.locator(".share-code")).toHaveText(
        codes[kind].slice(0, 4) + "-" + codes[kind].slice(4),
      );
      await expect(dialog.getByRole("tabpanel")).toHaveAccessibleName(
        titles[kind],
      );
    }
    await expect(dialog).toContainText("归属服务商：华东分公司");
    await expect(dialog).toContainText("直接归属本服务商");
    for (const tab of await dialog.getByRole("tab").all())
      await expect(tab).toBeInViewport({ ratio: 1 });
    expect(requests).toEqual(["GET:s1", "GET:s2", "GET:member"]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await dialog
        .locator(".provider-panel")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `../.runtime/branch-code-kinds-${width}.png`,
    });
  });
}

test("S1 and S2 only show the code types their own level can issue", async ({
  page,
}) => {
  const s1 = await openCodes(page, "s1");
  await expect(s1.dialog.getByRole("tab")).toHaveText([
    titles.s2,
    titles.member,
  ]);
  await expect(s1.dialog.locator(".share-code")).toHaveText("WXYZ-6789");
  await expect(s1.dialog).toContainText("归属服务商：上海服务商");
  await page.unrouteAll({ behavior: "wait" });
  const s2 = await openCodes(page, "s2");
  await expect(s2.dialog.getByRole("tab")).toHaveCount(0);
  await expect(
    s2.dialog.getByRole("heading", { name: titles.member, exact: true }),
  ).toBeVisible();
  await expect(s2.dialog).toContainText("归属服务商：浦东推荐官");
  expect(s2.requests).toEqual(["GET:member"]);
});

test("owner binding is a separate management section and is not fetched until opened", async ({
  page,
}) => {
  const { dialog, requests } = await openCodes(page, "branch", true);
  await expect(dialog.getByRole("tab")).toHaveCount(3);
  expect(requests).toEqual(["GET:s1"]);
  await dialog.locator(".owner-bind > summary").click();
  await expect(dialog.locator(".owner-bind .share-code")).toHaveText(
    "BIND-2345",
  );
  await expect(dialog.locator(".owner-bind")).toContainText(
    "仅用于负责人绑定自己的小程序账号",
  );
  expect(requests).toEqual(["GET:s1", "GET:bind"]);
});

test("a provider account cannot open its own responsible-person binding code", async ({
  page,
}) => {
  const { dialog, requests } = await openCodes(page, "branch", true, true);
  await expect(dialog.getByRole("tab")).toHaveCount(3);
  await expect(dialog.locator(".owner-bind")).toHaveCount(0);
  expect(requests).toEqual(["GET:s1"]);
});
