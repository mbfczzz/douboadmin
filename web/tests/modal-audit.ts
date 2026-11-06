import { expect, type Page } from "@playwright/test";

export async function inspectModal(page: Page, name: string) {
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  const shape = await dialog.evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    const close = panel.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭"]',
    )!;
    const box = close.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    return {
      overflow: panel.scrollWidth > panel.clientWidth + 2,
      outside:
        bounds.left < -1 ||
        bounds.right > innerWidth + 1 ||
        bounds.top < -1 ||
        bounds.bottom > innerHeight + 1,
      closeReachable: close.contains(hit),
      closeSize: Math.min(box.width, box.height),
      bodyLocked: document.body.style.overflow === "hidden",
      unlabeled: Array.from(
        panel.querySelectorAll<HTMLInputElement>("input,select,textarea"),
      )
        .filter(
          (el) =>
            el.type !== "hidden" &&
            !el.labels?.length &&
            !el.getAttribute("aria-label") &&
            !el.getAttribute("aria-labelledby"),
        )
        .map((el) => el.name || el.type),
    };
  });
  expect.soft(shape.overflow, `${name}: overflow`).toBe(false);
  expect.soft(shape.outside, `${name}: outside viewport`).toBe(false);
  expect.soft(shape.closeReachable, `${name}: close occluded`).toBe(true);
  expect
    .soft(shape.closeSize, `${name}: close target`)
    .toBeGreaterThanOrEqual(page.viewportSize()!.width <= 640 ? 44 : 32);
  expect.soft(shape.bodyLocked, `${name}: body scroll`).toBe(true);
  expect.soft(shape.unlabeled, `${name}: unlabeled inputs`).toEqual([]);
  const key = name.replace(/[^\p{L}\p{N}_-]+/gu, "-");
  await page.screenshot({
    path: `../.runtime/modal-audit-${key}.png`,
    animations: "disabled",
  });
  await dialog.evaluate((panel) => {
    const nodes = Array.from(
      panel.querySelectorAll<HTMLElement>(
        "button,input,select,textarea,a[href],[tabindex]",
      ),
    ).filter(
      (el) =>
        el.tabIndex >= 0 &&
        el.getClientRects().length &&
        !el.matches(":disabled") &&
        getComputedStyle(el).visibility === "visible",
    );
    nodes.at(-1)?.focus();
  });
  await page.keyboard.press("Tab");
  expect
    .soft(
      await dialog.evaluate((panel) => panel.contains(document.activeElement)),
      `${name}: tab escaped`,
    )
    .toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect
    .soft(
      await dialog.evaluate((panel) => panel.contains(document.activeElement)),
      `${name}: reverse tab escaped`,
    )
    .toBe(true);
}

export async function closeTop(page: Page) {
  const count = await page.getByRole("dialog").count();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(count - 1);
  if (count > 1) {
    expect(
      await page
        .getByRole("dialog")
        .last()
        .evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  } else {
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
  }
}
