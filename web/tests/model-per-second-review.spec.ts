import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

function fixture() {
  const row = modelPage("video").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    resolutions: ["480p", "720p"],
    durations: [4, 5],
    settings: { priceMatrix: { "4s": { "480p": 52 }, "5s": { "480p": 65 } } },
  };
  return row;
}

test("unapplied per-second input blocks saving other cells until it is filled", async ({
  page,
}) => {
  let row = fixture(),
    writes = 0;
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("video"), items: [row] } }),
  );
  await page.route(`**/api/admin/models/${row.id}`, (route) => {
    writes++;
    row = {
      ...row,
      version: row.version + 1,
      data: route.request().postDataJSON().data,
    };
    return route.fulfill({ json: row });
  });
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await dialog.getByLabel("4s 720P 积分", { exact: true }).fill("10");
  const rate = dialog.getByLabel("480P 每秒积分", { exact: true });
  await rate.fill("15");
  await expect(dialog).toContainText("尚未填充，请点击填充本列");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".save-confirmation")).toHaveCount(0);
  expect(await rate.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(
    false,
  );
  expect(writes).toBe(0);
  await dialog
    .getByRole("button", { name: "填充 480P 全部时长", exact: true })
    .click();
  await expect(dialog.getByLabel("4s 480P 积分", { exact: true })).toHaveValue(
    "60",
  );
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  expect(row.data.settings?.priceMatrix?.["4s"]).toEqual({
    "480p": 60,
    "720p": 10,
  });
});

test("manual overrides reset the rate hint without losing another column's unfinished input", async ({
  page,
}) => {
  const row = fixture();
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("video"), items: [row] } }),
  );
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await dialog.getByLabel("480P 每秒积分", { exact: true }).fill("14");
  await dialog
    .getByRole("button", { name: "填充 480P 全部时长", exact: true })
    .click();
  await expect(dialog).toContainText("已填充 2 项");
  await dialog.getByLabel("720P 每秒积分", { exact: true }).fill("3");
  await dialog.getByLabel("5s 480P 积分", { exact: true }).fill("71");
  await expect(dialog.getByLabel("480P 每秒积分", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    dialog.getByText("已填充 2 项，保存后生效", { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("720P 每秒积分", { exact: true })).toHaveValue(
    "3",
  );
});

test("a version conflict refreshes inferred rates alongside the rebased price cells", async ({
  page,
}) => {
  let row = fixture(),
    writes = 0;
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("video"), items: [row] } }),
  );
  await page.route("**/api/admin/models", (route) =>
    route.fulfill({ json: [row] }),
  );
  await page.route(`**/api/admin/models/${row.id}`, (route) => {
    if (++writes === 1) {
      row = {
        ...row,
        version: 2,
        data: {
          ...row.data,
          settings: {
            priceMatrix: { "4s": { "480p": 80 }, "5s": { "480p": 100 } },
          },
        },
      };
      return route.fulfill({ status: 409, json: { error: "配置已更新" } });
    }
    row = { ...row, version: 3, data: route.request().postDataJSON().data };
    return route.fulfill({ json: row });
  });
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await dialog.getByLabel("4s 720P 积分", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog.getByRole("alert")).toContainText("已载入最新版本");
  await expect(dialog.getByLabel("480P 每秒积分", { exact: true })).toHaveValue(
    "20",
  );
  await expect(dialog.getByLabel("4s 720P 积分", { exact: true })).toHaveValue(
    "10",
  );
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  expect(row.data.settings?.priceMatrix?.["4s"]).toEqual({
    "480p": 80,
    "720p": 10,
  });
});
