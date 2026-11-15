import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

test("a model with no pricing tiers clearly uses base consumption points", async ({
  page,
}) => {
  const row = modelPage("image").items[0];
  row.data = { ...row.data, points: 7.5, resolutions: [], qualities: [] };
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("image"), items: [row] } }),
  );
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await expect(dialog).toContainText("按「基础信息 → 消耗积分」计费");
  await expect(dialog).toContainText("每次生成消耗 7.5 积分");
  await expect(dialog.locator("table")).toHaveCount(0);
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
});

for (const kind of ["image", "video"]) {
  test(`${kind} tier prices distinguish unset, explicit zero and cleared`, async ({
    page,
  }) => {
    let row = modelPage(kind).items[0] as Row<Model>;
    row.data = {
      ...row.data,
      points: 7.5,
      resolutions: ["1k"],
      qualities: [],
      durations: kind === "video" ? [5] : [],
    };
    const key = kind === "video" ? "5s" : "default";
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
    await page.getByRole("button", { name: "基础信息", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: /^基础信息 ·/ });
    await expect(dialog.getByLabel("消耗积分", { exact: true })).toHaveValue(
      "7.5",
    );
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    for (const value of ["2.25", "0", ""]) {
      await page.getByRole("button", { name: "定价", exact: true }).click();
      dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
      await expect(dialog).toContainText("留空则每次生成消耗 7.5 积分");
      const price = dialog.getByRole("spinbutton");
      await expect(price).toHaveAttribute("placeholder", "基础 7.5");
      await price.fill(value);
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await confirmSubmission(page);
      await expect(dialog).toHaveCount(0);
      expect(row.data.points).toBe(7.5);
      expect(row.data.settings?.priceMatrix?.[key]?.["1k"]).toBe(
        value === "" ? undefined : Number(value),
      );
    }
    await page.getByRole("button", { name: "定价", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("spinbutton")).toHaveValue(
      "",
    );
  });
}
