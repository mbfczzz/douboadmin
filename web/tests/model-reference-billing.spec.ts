import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

// 参考视频计费 on a 按次 video model also shows the 时长 × 清晰度 table it
// charges from, and saves the switch with the prices.
test("reference video billing shows and saves the duration table", async ({
  page,
}) => {
  let row = modelPage("video").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    resolutions: ["720p"],
    durations: [5, 10],
    modes: ["omni_ref"],
    referenceTypes: ["image", "video"],
    settings: {
      videoBillingMode: "per_request",
      pricePerRequestByResolution: { "720p": 20 },
    },
  };
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("video"), items: [row] } }),
  );
  await page.route("**/api/admin/models", (route) =>
    route.fulfill({ json: [row] }),
  );
  await page.route(`**/api/admin/models/${row.id}`, (route) => {
    row = { ...row, version: 2, data: route.request().postDataJSON().data };
    return route.fulfill({ json: row });
  });
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await expect(dialog.getByLabel("5s 720P 积分", { exact: true })).toHaveCount(
    0,
  );
  await dialog.getByText("参考视频计费", { exact: true }).click();
  await dialog.getByLabel("5s 720P 积分", { exact: true }).fill("35");
  await dialog.getByLabel("10s 720P 积分", { exact: true }).fill("60");
  await expect(dialog.getByLabel("720P 按次积分", { exact: true })).toHaveValue(
    "20",
  );
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  expect(row.data.settings?.referenceVideoBillingEnabled).toBe(true);
  expect(row.data.settings?.priceMatrix).toEqual({
    "5s": { "720p": 35 },
    "10s": { "720p": 60 },
  });
});
