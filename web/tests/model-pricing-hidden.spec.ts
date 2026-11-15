import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import type { Model, Row } from "../src/api";

for (const mode of ["image-quality", "video-duration", "video-per-request"]) {
  test(`${mode}: pricing shows only enabled dimensions`, async ({ page }) => {
    const image = mode === "image-quality";
    const kind = image ? "image" : "video";
    const row = modelPage(kind).items[0] as Row<Model>;
    row.data = {
      ...row.data,
      points: 1,
      resolutions: ["1k", "2k"],
      qualities: image ? ["1", "4"] : [],
      durations: image ? [] : [5, 10],
      settings: {
        hideQuality: true,
        hideResolution: !image,
        videoBillingMode:
          mode === "video-per-request" ? "per_request" : "duration",
        priceMatrix: {
          "1": { "1k": 4 },
          "4": { "2k": 9 },
          default: { "1k": 1.25 },
        },
        pricePerRequestByResolution: { "1k": 7 },
      },
    };
    await openModels(page, (route) =>
      route.fulfill({ json: { ...modelPage(kind), items: [row] } }),
    );
    await page.getByRole("button", { name: "定价", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
    if (image) {
      await expect(dialog).toContainText("默认（不分画质）");
      await expect(dialog.getByRole("spinbutton")).toHaveCount(2);
      await expect(
        dialog.getByRole("spinbutton", {
          name: "默认（不分画质） 1K 积分",
          exact: true,
        }),
      ).toHaveValue("1.25");
      await expect(
        dialog.getByRole("spinbutton", { name: "1 1K 积分", exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(dialog).toContainText("每次生成消耗 1 积分");
      await expect(dialog.locator("table")).toHaveCount(0);
      await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
    }
  });
}
