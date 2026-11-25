import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

// A fixed 火山方舟 Seedance model is priced per million video tokens by
// output resolution, without and with an input video.
test("Seedance pricing edits video token prices per resolution", async ({
  page,
}) => {
  let row = modelPage("video").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    key: "arkvideo:doubao-seedance-2-0-260128",
    name: "Seedance 2.0 官方",
    resolutions: ["480p", "720p"],
    durations: [4, 5, 6],
    modes: ["t2v", "omni_ref"],
    referenceTypes: ["image", "video", "audio"],
    settings: {
      videoTokenPrices: {
        "480p": { plain: 460, withVideo: 280 },
        "720p": { plain: 460, withVideo: 280 },
      },
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
  await expect(dialog.getByText("按量计费（视频 token）")).toBeVisible();
  await expect(dialog.getByText("参考视频计费", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByLabel("720P 不含视频输入单价", { exact: true }),
  ).toHaveValue("460");
  await dialog.getByLabel("720P 含视频输入单价", { exact: true }).fill("300");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  expect(row.data.settings?.videoTokenPrices?.["720p"]).toEqual({
    plain: 460,
    withVideo: 300,
  });
});

// Without the 火山方舟 key a fixed model says so, not "上游不可用".
test("an unavailable Seedance model asks for the 火山方舟 key", async ({
  page,
}) => {
  const row = modelPage("video").items[0] as Row<Model>;
  row.data = {
    ...row.data,
    key: "arkvideo:doubao-seedance-2-0-260128",
    name: "Seedance 2.0 官方",
    available: false,
  };
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("video"), items: [row] } }),
  );
  await expect(page.getByText("未配置火山方舟 Key").first()).toBeVisible();
  await expect(page.getByText("上游不可用")).toHaveCount(0);
});
