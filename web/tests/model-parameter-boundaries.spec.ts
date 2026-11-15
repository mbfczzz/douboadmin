import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

for (const legacyEmpty of [false, true]) {
  test(`video duration and ratio keep a valid selection (${legacyEmpty ? "legacy" : "current"})`, async ({
    page,
  }) => {
    let row = modelPage("video").items[0] as Row<Model>;
    row.data = {
      ...row.data,
      resolutions: ["768p"],
      ratios: ["16:9"],
      durations: legacyEmpty ? [60] : [6, 15],
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
    await page.getByRole("button", { name: "生成能力", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^生成能力 ·/ });
    const durations = dialog.getByRole("group", {
      name: "支持时长",
      exact: true,
    });
    const ratios = dialog.getByRole("group", { name: "支持比例", exact: true });
    if (legacyEmpty) {
      await expect(
        dialog.getByRole("button", { name: "保存", exact: true }),
      ).toBeDisabled();
      await durations.getByRole("button", { name: "30s", exact: true }).click();
    } else {
      await durations.getByRole("button", { name: "6s", exact: true }).click();
    }
    await expect(
      durations.getByRole("button", {
        name: legacyEmpty ? "30s" : "15s",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      ratios.getByRole("button", { name: "16:9", exact: true }),
    ).toBeDisabled();
    await ratios.getByRole("button", { name: "1:1", exact: true }).click();
    await ratios.getByRole("button", { name: "16:9", exact: true }).click();
    await expect(
      ratios.getByRole("button", { name: "1:1", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(row.data.settings?.durations).toEqual([legacyEmpty ? 30 : 15]);
    expect(row.data.settings?.ratios).toEqual(["1:1"]);
  });
}

test("uppercase legacy qualities have Chinese labels and retain their price keys", async ({
  page,
}) => {
  const row = modelPage("image").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    qualities: ["LOW", "MEDIUM", "HIGH"],
    resolutions: ["1K"],
    settings: { priceMatrix: { HIGH: { "1K": 7 } } },
  };
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("image"), items: [row] } }),
  );
  await page.getByRole("button", { name: "生成能力", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^生成能力 ·/ });
  await expect(
    dialog
      .getByRole("group", { name: "支持画质", exact: true })
      .getByRole("button"),
  ).toHaveText(["低画质", "中画质", "高画质"]);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "定价", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("高画质 1K 积分", { exact: true }),
  ).toHaveValue("7");
});
