import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

// DeepSeek / 豆包 chat models are priced per 1,000 tokens (按量).
test("chat models set input and output token prices under 定价", async ({
  page,
}) => {
  let row = modelPage("chat").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    name: "DeepSeek deepseek-chat",
    points: 1,
    settings: { tokenInputPrice: 0.02, tokenOutputPrice: 0.03 },
  };
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("chat"), items: [row] } }),
  );
  let saved: Model | undefined;
  await page.route(`**/api/admin/models/${row.id}`, (route) => {
    saved = route.request().postDataJSON().data;
    row = { ...row, version: row.version + 1, data: saved! };
    return route.fulfill({ json: row });
  });
  await page.getByRole("button", { name: "定价", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^积分定价 ·/ });
  await expect(dialog).toContainText("按量计费（token）");
  await expect(
    dialog.getByLabel("输入单价（积分 / 千 token）", { exact: true }),
  ).toHaveValue("0.02");
  await dialog.getByLabel("输出单价（积分 / 千 token）").fill("0.05");
  await dialog.getByLabel("单次回复上限（token）").fill("2048");
  await expect(
    dialog.getByLabel("缓存命中输入单价（积分 / 千 token）"),
  ).toHaveValue("0.02"); // unset: the input price
  await dialog.getByLabel("缓存命中输入单价（积分 / 千 token）").fill("0.0002");
  await dialog.getByLabel("高峰时段倍数").fill("2");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const review = page.getByRole("dialog", { name: "确认修改积分定价" });
  await expect(review).toContainText("0.05"); // prices are shown, not hidden like keys
  await confirmSubmission(page);
  await expect.poll(() => saved?.settings.tokenOutputPrice).toBe(0.05);
  expect(saved?.settings.maxOutputTokens).toBe(2048);
  expect(saved?.settings.tokenCachedPrice).toBe(0.0002);
  expect(saved?.settings.peakPriceRate).toBe(2);
});
