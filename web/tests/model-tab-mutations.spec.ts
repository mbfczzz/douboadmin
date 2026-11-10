import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";

test("publishing a model confirms and invalidates all cached categories", async ({
  page,
}) => {
  let published = true;
  const calls: string[] = [],
    writes: unknown[] = [];
  await openModels(page, (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind")!;
    calls.push(kind);
    return route.fulfill({ json: modelPage(kind, { published }) });
  });
  await page.route("**/api/admin/models/image-model", (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    published = body.data.published;
    return route.fulfill({
      json: { ...modelPage("image", { published }).items[0], version: 2 },
    });
  });
  await expect(page.getByRole("switch")).toBeChecked();
  await page.getByRole("tab", { name: "图片模型", exact: true }).click();
  await expect(page.getByRole("switch")).toBeChecked();
  await page.getByRole("tab", { name: "全部", exact: true }).click();
  await page.getByRole("switch").click();
  expect(writes).toEqual([]);
  await confirmSubmission(page);
  await expect(page.getByRole("switch")).not.toBeChecked();
  await page.getByRole("tab", { name: "图片模型", exact: true }).click();
  await expect(page.getByRole("switch")).not.toBeChecked();
  expect(writes).toHaveLength(1);
  expect(calls.filter((kind) => kind === "")).toHaveLength(2);
  expect(calls.filter((kind) => kind === "image")).toHaveLength(2);
});

test("upstream sync finishing after a category switch refreshes the visible category", async ({
  page,
}) => {
  let synced = false,
    arrived = false,
    release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  await openModels(page, (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind")!;
    calls.push(kind);
    return route.fulfill({
      json: modelPage(kind, synced ? { name: "同步后的当前分类模型" } : {}),
    });
  });
  await page.route("**/api/admin/models/sync", async (route) => {
    arrived = true;
    await pending;
    synced = true;
    await route.fulfill({ json: { created: 0, updated: 1, conflicts: 0 } });
  });
  await expect(page.getByText("图片模型条目", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "同步上游", exact: true }).click();
  await confirmSubmission(page);
  await expect.poll(() => arrived).toBe(true);
  try {
    await page.getByRole("tab", { name: "视频模型", exact: true }).click();
    await expect(page.getByText("视频模型条目", { exact: true })).toBeVisible();
  } finally {
    release();
  }
  await expect(
    page.getByText("同步后的当前分类模型", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "视频模型", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("region", { name: "模型列表", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  expect(calls).toEqual(["", "video", "video"]);
});
