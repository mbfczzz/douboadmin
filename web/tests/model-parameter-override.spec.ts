import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

for (const kind of ["image", "video"]) {
  test(`${kind}: upstream restrictions do not disable configured parameter options`, async ({
    page,
  }) => {
    let row = modelPage(kind).items[0] as Row<Model>;
    row.data = {
      ...row.data,
      resolutions: [kind === "image" ? "1k" : "720p"],
      qualities: kind === "image" ? ["1", "4"] : [],
      ratios: ["16:9"],
      durations: kind === "video" ? [6, 15] : [],
    };
    await openModels(page, (route) =>
      route.fulfill({ json: { ...modelPage(kind), items: [row] } }),
    );
    await page.route(`**/api/admin/models/${row.id}`, (route) => {
      row = {
        ...row,
        version: row.version + 1,
        data: route.request().postDataJSON().data,
      };
      return route.fulfill({ json: row });
    });
    await page.getByRole("button", { name: "生成能力", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: /^生成能力 ·/ });
    const resolution = dialog.getByRole("group", {
      name: "支持清晰度",
      exact: true,
    });
    await expect(resolution.getByRole("button")).toHaveText(
      kind === "image"
        ? ["1K", "2K", "4K"]
        : ["480P", "720P", "768P", "1080P", "2K", "4K"],
    );
    await expect(
      dialog
        .getByRole("group", { name: "支持比例", exact: true })
        .getByRole("button"),
    ).toHaveText(["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"]);
    await expect(
      resolution.getByRole("button", { name: "4K", exact: true }),
    ).toBeEnabled();
    await resolution.getByRole("button", { name: "4K", exact: true }).click();
    await dialog
      .getByRole("group", { name: "支持比例", exact: true })
      .getByRole("button", { name: "21:9", exact: true })
      .click();
    if (kind === "image") {
      await expect(
        dialog
          .getByRole("group", { name: "支持画质", exact: true })
          .getByRole("button"),
      ).toHaveText(["低画质", "中画质", "高画质"]);
      await dialog
        .getByRole("group", { name: "支持画质", exact: true })
        .getByRole("button", { name: "高画质", exact: true })
        .click();
    } else {
      await resolution
        .getByRole("button", { name: "768P", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "1s", exact: true }),
      ).toBeEnabled();
      await expect(
        dialog.getByLabel("可选时长上限（秒）", { exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog
          .getByRole("group", { name: "支持时长", exact: true })
          .locator(".config-chips button"),
      ).toHaveCount(30);
      await dialog
        .getByRole("button", { name: "全选时长", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "1s", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        dialog.getByRole("button", { name: "30s", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(row.data.settings?.resolutions).toContain("4k");
    if (kind === "video")
      expect(row.data.settings?.resolutions).toContain("768p");
    expect(row.data.settings?.ratios).toContain("21:9");
    if (kind === "video")
      expect(row.data.settings?.durations).toEqual(
        Array.from({ length: 30 }, (_, i) => i + 1),
      );
    else expect(row.data.settings?.qualities).toContain("high");
    await page.getByRole("button", { name: "生成能力", exact: true }).click();
    dialog = page.getByRole("dialog", { name: /^生成能力 ·/ });
    await expect(
      dialog.getByRole("button", { name: "4K", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    if (kind === "video")
      await expect(
        dialog.getByRole("button", { name: "30s", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "定价", exact: true }).click();
    await expect(
      page.getByRole("columnheader", { name: "4K", exact: true }),
    ).toBeVisible();
  });
}
