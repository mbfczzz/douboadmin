import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

test("a pricing conflict preserves another editor's cell on retry", async ({
  page,
}) => {
  let row = modelPage("image").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    resolutions: ["2k", "1k"],
    qualities: ["low"],
    settings: { priceMatrix: { low: { "1k": 2, "2k": 4 } } },
  };
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("image"), items: [row] } }),
  );
  await page.route("**/api/admin/models", (route) =>
    route.fulfill({ json: [row] }),
  );
  let writes = 0;
  await page.route(`**/api/admin/models/${row.id}`, (route) => {
    if (++writes === 1) {
      row = {
        ...row,
        version: 2,
        data: {
          ...row.data,
          settings: { priceMatrix: { low: { "1k": 2, "2k": 9 } } },
        },
      };
      return route.fulfill({ status: 409, json: { error: "记录已变化" } });
    }
    const body = route.request().postDataJSON();
    expect(body.version).toBe(2);
    row = { ...row, version: 3, data: body.data };
    return route.fulfill({ json: row });
  });
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await expect(dialog.locator("thead th")).toHaveText([
    "画质 / 清晰度",
    "1K",
    "2K",
  ]);
  await dialog.getByLabel("低画质 1K 积分", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog.getByRole("alert")).toContainText("已载入最新版本");
  await expect(
    dialog.getByLabel("低画质 1K 积分", { exact: true }),
  ).toHaveValue("3");
  await expect(
    dialog.getByLabel("低画质 2K 积分", { exact: true }),
  ).toHaveValue("9");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  expect(row.data.settings?.priceMatrix?.low).toEqual({ "1k": 3, "2k": 9 });
});

test("legacy null capabilities do not crash capability or pricing dialogs", async ({
  page,
}) => {
  const row = modelPage("image").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    modes: null,
    resolutions: null,
    qualities: null,
    ratios: null,
    durations: null,
    referenceTypes: null,
  } as unknown as Model;
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("image"), items: [row] } }),
  );
  await page.getByRole("button", { name: "生成能力", exact: true }).click();
  const capabilities = page.getByRole("dialog", { name: /^生成能力 ·/ });
  await expect(capabilities).toBeVisible();
  await expect(capabilities).toContainText("可自由配置，由中转站校验");
  await capabilities.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const pricing = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await expect(pricing).toContainText("按「基础信息 → 消耗积分」计费");
  await expect(pricing.locator("table")).toHaveCount(0);
});
