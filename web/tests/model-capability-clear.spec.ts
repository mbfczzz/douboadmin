import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

for (const width of [1440, 390]) {
  test(`clearing quality and resolution stays cleared after saving at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let row = modelPage("image").items[0] as Row<Model>;
    row.data = {
      ...row.data,
      name: "Midjourney V8.2",
      qualities: ["1", "4"],
      resolutions: ["1k", "2k"],
    };
    let writes = 0;
    await openModels(page, (route) =>
      route.fulfill({ json: { ...modelPage("image"), items: [row] } }),
    );
    await page.route(`**/api/admin/models/${row.id}`, (route) => {
      const body = route.request().postDataJSON();
      const data = body.data as Model;
      // Match Go's omitempty encoding, which drops empty selection arrays.
      for (const field of ["qualities", "resolutions"] as const) {
        if (!data.settings?.[field]?.length) delete data.settings?.[field];
      }
      row = { ...row, version: row.version + 1, data };
      writes++;
      return route.fulfill({ json: row });
    });
    const open = async () => {
      await page.getByRole("button", { name: "生成能力", exact: true }).click();
      return page.getByRole("dialog", {
        name: "生成能力 · Midjourney V8.2",
        exact: true,
      });
    };
    let dialog = await open();
    const group = (label: string) =>
      dialog.getByRole("group", { name: label, exact: true });
    for (const label of ["1", "4"]) {
      await group("支持画质")
        .getByRole("button", { name: label, exact: true })
        .click();
    }
    for (const label of ["1K", "2K"]) {
      await group("支持清晰度")
        .getByRole("button", { name: label, exact: true })
        .click();
    }
    await expect(
      group("支持画质").locator('[aria-pressed="true"]'),
    ).toHaveCount(0);
    await expect(
      group("支持清晰度").locator('[aria-pressed="true"]'),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    expect(writes).toBe(0);
    await expect(page.locator(".save-confirmation")).toContainText(
      "隐藏小程序画质选择",
    );
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(writes).toBe(1);
    expect(row.data.settings?.hideQuality).toBe(true);
    expect(row.data.settings?.hideResolution).toBe(true);
    dialog = await open();
    await expect(
      group("支持画质").locator('[aria-pressed="true"]'),
    ).toHaveCount(0);
    await expect(
      group("支持清晰度").locator('[aria-pressed="true"]'),
    ).toHaveCount(0);
    await group("支持画质")
      .getByRole("button", { name: "4", exact: true })
      .click();
    await group("支持清晰度")
      .getByRole("button", { name: "2K", exact: true })
      .click();
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(row.data.settings?.hideQuality).toBe(false);
    expect(row.data.settings?.hideResolution).toBe(false);
    expect(row.data.settings?.qualities).toEqual(["4"]);
    expect(row.data.settings?.resolutions).toEqual(["2k"]);
    dialog = await open();
    await expect(
      group("支持画质").getByRole("button", { name: "4", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      group("支持画质").getByRole("button", { name: "1", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      group("支持清晰度").getByRole("button", { name: "2K", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  });
}
