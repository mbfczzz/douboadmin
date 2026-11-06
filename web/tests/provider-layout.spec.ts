import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const ids = Array.from(
  { length: 8 },
  (_, i) => `1853827fdb6db9740632f15301e1f2b${i}`,
);
const names = [
  "华东服务商",
  "上海服务商",
  "浦东服务商",
  "创作工作室",
  "品牌内容团队",
  "视频创作团队",
  "杭州服务商",
  "超长名称服务商".repeat(5),
];
const rows = ids.map((id, i) => ({
  record: {
    id,
    version: 1,
    createdAt: "2026-11-06T00:00:00Z",
    data: {
      name: names[i],
      parentId: i > 0 && i < 6 ? ids[i - 1] : "root",
      path: [],
      status: i === 6 ? "disabled" : "active",
      retailPer100Fen: 10000,
      childMarginBps: 5000,
    },
  },
  quota: { users: { granted: 100, used: 10, allocated: 20, reserved: 0 } },
}));

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/partners/tree", (route) =>
    route.fulfill({ json: rows }),
  );
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(page.locator(".provider-tree-row")).toHaveCount(8);
});

test("provider layout stays aligned and contained across desktop, tablet and mobile", async ({
  page,
}) => {
  for (const width of [1440, 1100, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.locator(".partner-hub").evaluate((hub) => {
      const rect = hub.getBoundingClientRect();
      const selectors =
        ".provider-toolbar, .provider-tree-row, .provider-tree-name, .provider-tree-meta, .provider-tree-actions, .provider-id";
      return {
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        overflow: Array.from(hub.querySelectorAll(selectors))
          .filter((el) => {
            if (getComputedStyle(el).display === "contents") return false;
            const box = el.getBoundingClientRect();
            return (
              box.left < rect.left - 1 ||
              box.right > rect.right + 1 ||
              el.scrollWidth > el.clientWidth + 1
            );
          })
          .map((el) => el.className),
      };
    });
    expect(geometry, `viewport ${width}`).toEqual({
      pageOverflow: false,
      overflow: [],
    });
    const tree = page.locator(".provider-tree");
    const toggle = await tree.locator(".tree-toggle").first().boundingBox();
    const spacer = await tree.locator(".tree-spacer").first().boundingBox();
    expect(toggle!.width).toBe(spacer!.width);
    if (width === 1440) {
      const heads = tree.locator(".provider-tree-head > span");
      const rootRow = tree.locator(".provider-tree-row").first();
      const total = await rootRow
        .locator(".provider-quota")
        .first()
        .boundingBox();
      const totalHead = await heads.nth(2).boundingBox();
      expect(total!.x + total!.width).toBeCloseTo(
        totalHead!.x + totalHead!.width,
        0,
      );
      const actions = await rootRow
        .locator(".provider-tree-actions")
        .boundingBox();
      const actionHead = await heads.last().boundingBox();
      expect(actions!.x + actions!.width).toBeCloseTo(
        actionHead!.x + actionHead!.width,
        0,
      );
    }
    await page.screenshot({
      path: `../.runtime/provider-layout-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("search, expansion, copy success and fallback keep working", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: `收起${names[0]}`, exact: true })
    .click();
  await expect(page.locator(".provider-tree-row")).toHaveCount(3);
  await page.getByLabel("搜索服务商").fill(ids[2]);
  await expect(page.getByText(names[2], { exact: true })).toBeVisible();
  await page.getByLabel("搜索服务商").fill("不存在的服务商");
  await expect(
    page.getByText("没有匹配的服务商", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("搜索服务商").fill("");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          sessionStorage.setItem("copied-provider", value);
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: `复制服务商编号 ${ids[0]}`, exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "已复制" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("copied-provider")),
  ).toBe(ids[0]);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: `复制服务商编号 ${ids[6]}`, exact: true })
    .click();
  await expect(
    page.getByText(`复制失败，请手动复制：${ids[6]}`, { exact: true }),
  ).toBeVisible();
});
