import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

for (const width of [1440, 390]) {
  test(`per-second filling is per column, editable and confirmed before saving at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let row = modelPage("video").items[0] as Row<Model>;
    row.data = {
      ...row.data,
      resolutions: ["720p", "480p"],
      durations: [4, 5, 14],
      settings: {
        priceMatrix: {
          "4s": { "480p": 1, "720p": 80 },
          "14s": { "480p": 181 },
          "30s": { "480p": 999 },
        },
      },
    };
    let writes = 0;
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
    let dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
    await expect(dialog.locator("thead tr").first().locator("th")).toHaveText([
      "时长 / 清晰度",
      "480P",
      "720P",
    ]);
    await dialog.getByLabel("480P 每秒积分", { exact: true }).fill("0.001");
    await expect(
      dialog.getByRole("button", { name: "填充 480P 全部时长", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByLabel("4s 480P 积分", { exact: true }),
    ).toHaveValue("1");
    await dialog.getByLabel("480P 每秒积分", { exact: true }).fill("13");
    await dialog
      .getByRole("button", { name: "填充 480P 全部时长", exact: true })
      .click();
    await expect(
      dialog.getByLabel("4s 480P 积分", { exact: true }),
    ).toHaveValue("52");
    await expect(
      dialog.getByLabel("5s 480P 积分", { exact: true }),
    ).toHaveValue("65");
    await expect(
      dialog.getByLabel("14s 480P 积分", { exact: true }),
    ).toHaveValue("182");
    await expect(
      dialog.getByLabel("4s 720P 积分", { exact: true }),
    ).toHaveValue("80");
    await expect(
      dialog.getByLabel("5s 720P 积分", { exact: true }),
    ).toHaveValue("");
    expect(writes).toBe(0);
    await page.screenshot({ path: `../.runtime/per-second-${width}.png` });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.locator(".save-confirmation")).toBeVisible();
    expect(writes).toBe(0);
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(row.data.settings?.resolutions).toEqual(["720p", "480p"]);
    expect(row.data.settings?.priceMatrix?.["30s"]?.["480p"]).toBe(999);
    await page.getByRole("button", { name: "定价", exact: true }).click();
    dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
    await expect(
      dialog.getByLabel("480P 每秒积分", { exact: true }),
    ).toHaveValue("13");
    await dialog.getByLabel("14s 480P 积分", { exact: true }).fill("180");
    await dialog.getByLabel("720P 每秒积分", { exact: true }).fill("0");
    await dialog
      .getByRole("button", { name: "填充 720P 全部时长", exact: true })
      .click();
    await expect(
      dialog.getByLabel("14s 480P 积分", { exact: true }),
    ).toHaveValue("180");
    await expect(
      dialog.getByLabel("4s 720P 积分", { exact: true }),
    ).toHaveValue("0");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(row.data.settings?.priceMatrix?.["14s"]?.["480p"]).toBe(180);
    expect(row.data.settings?.priceMatrix?.["4s"]?.["720p"]).toBe(0);
  });
}

test("per-request prices sort resolutions while retaining their exact price keys", async ({
  page,
}) => {
  let row = modelPage("video").items[0] as Row<Model>;
  row.data.resolutions = ["720P", "480p"];
  row.data.settings = {
    videoBillingMode: "per_request",
    pricePerRequestByResolution: { "720P": 600, "480p": 400 },
  };
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("video"), items: [row] } }),
  );
  await page.route(`**/api/admin/models/${row.id}`, (route) => {
    row = {
      ...row,
      version: row.version + 1,
      data: route.request().postDataJSON().data,
    };
    return route.fulfill({ json: row });
  });
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await expect(dialog.locator(".per-second-fill")).toHaveCount(0);
  await expect(dialog.locator("tbody tr td:first-child")).toHaveText([
    "480P",
    "720P",
  ]);
  await expect(dialog.getByLabel("480P 按次积分", { exact: true })).toHaveValue(
    "400",
  );
  await expect(dialog.getByLabel("720P 按次积分", { exact: true })).toHaveValue(
    "600",
  );
  await page.screenshot({
    path: "../.runtime/per-request-resolution-order.png",
  });
  await dialog.getByLabel("480P 按次积分", { exact: true }).fill("420");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  expect(row.data.settings?.resolutions).toEqual(["720P", "480p"]);
  expect(row.data.settings?.pricePerRequestByResolution).toEqual({
    "720P": 600,
    "480p": 420,
  });
});
