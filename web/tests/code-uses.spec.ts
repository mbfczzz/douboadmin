import { expect, test, type Page } from "@playwright/test";
import { codes, openCodes, titles } from "./provider-code-fixture";

function item(status = "pending", kind = "s1", user = "scan-user") {
  return {
    id: kind + user,
    version: 1,
    createdAt: "2026-11-10T00:00:00Z",
    data: {
      userId: user,
      nickname: "微信昵称",
      name: "扫码用户" + user,
      phone: "13900139004",
      code: codes[kind as keyof typeof codes],
      codeKind: kind,
      role: kind === "member" ? "member" : kind,
      status,
      reason: status === "rejected" ? "资料不符" : "",
      registeredAt: "2026-11-10T00:00:00Z",
      method: "scan",
    },
  };
}
async function openUses(page: Page) {
  const result = await openCodes(page);
  const calls: URLSearchParams[] = [];
  await page.route(
    "**/api/admin/partners/code-provider/code-uses?*",
    (route) => {
      const query = new URL(route.request().url()).searchParams;
      calls.push(query);
      const kind = query.get("kind") || "s1",
        status = query.get("status") || "";
      const rows = [
        item("pending", kind),
        item("approved", kind, "approved-user"),
        item("rejected", kind, "rejected-user"),
      ].filter((row) => !status || row.data.status === status);
      return route.fulfill({
        json: {
          items: rows,
          page: Number(query.get("page")),
          size: 20,
          total: rows.length,
        },
      });
    },
  );
  const records = result.dialog.getByRole("region", {
    name: "扫码登记记录",
    exact: true,
  });
  await records
    .getByRole("button", { name: "刷新扫码记录", exact: true })
    .click();
  await expect(
    records.getByText("扫码用户scan-user", { exact: false }),
  ).toBeVisible();
  return { ...result, records, calls };
}

for (const width of [1440, 390, 320]) {
  test(`usage records show pending users and approval states at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { records } = await openUses(page);
    for (const state of ["待开通", "已通过", "已拒绝"])
      await expect(
        records.locator(".tag").filter({ hasText: state }),
      ).toBeVisible();
    await expect(records).toContainText("13900139004");
    await expect(records).toContainText("KMNP-2345");
    await expect(records).toContainText("资料不符");
    await expect(
      records.getByRole("button", { name: "开通", exact: true }),
    ).toHaveCount(1);
    expect(
      await records.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      (await records
        .getByRole("textbox", { name: "搜索扫码记录" })
        .boundingBox())!.width,
    ).toBeGreaterThanOrEqual(120);
    await records.screenshot({
      path: `../.runtime/code-uses-${width}.png`,
      animations: "disabled",
    });
  });
}

test("usage filters follow the selected code and preserve code-card geometry", async ({
  page,
}) => {
  const { dialog, records, calls } = await openUses(page);
  expect(calls.at(-1)?.get("code")).toBe(codes.s1);
  await expect(
    dialog.getByRole("heading", { name: "已加入的会员" }),
  ).toHaveCount(0);
  await records
    .getByRole("combobox", { name: "扫码登记状态" })
    .selectOption("pending");
  await expect(records.locator(".tag")).toHaveCount(1);
  expect(calls.at(-1)?.get("status")).toBe("pending");
  await records
    .getByRole("textbox", { name: "搜索扫码记录" })
    .fill("scan-user");
  await records.getByRole("button", { name: "查询", exact: true }).click();
  await expect.poll(() => calls.at(-1)?.get("q")).toBe("scan-user");
  const before = await dialog.locator(".share-panel").boundingBox();
  await dialog.getByRole("tab", { name: titles.s2, exact: true }).click();
  await expect.poll(() => calls.at(-1)?.get("kind")).toBe("s2");
  expect(calls.at(-1)?.get("code")).toBe(codes.s2);
  await expect(
    dialog.getByRole("heading", { name: "已加入的会员" }),
  ).toHaveCount(0);
  await expect(records).toContainText("S2 推荐官");
  const after = await dialog.locator(".share-panel").boundingBox();
  expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
});

test("late records cannot replace the selected code's users", async ({
  page,
}) => {
  const { dialog, records } = await openUses(page);
  let release!: () => void,
    arrived = false,
    completed = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/admin/partners/code-provider/code-uses?*",
    async (route) => {
      const kind = new URL(route.request().url()).searchParams.get("kind");
      if (kind === "s2") {
        arrived = true;
        await pending;
      }
      await route.fulfill({
        json: {
          items: [
            item("pending", kind!, kind === "s2" ? "迟到记录" : "当前记录"),
          ],
          page: 1,
          size: 20,
          total: 1,
        },
      });
      if (kind === "s2") completed = true;
    },
  );
  await dialog.getByRole("tab", { name: titles.s2, exact: true }).click();
  await expect.poll(() => arrived).toBe(true);
  await dialog.getByRole("tab", { name: titles.member, exact: true }).click();
  try {
    await expect(records).toContainText("扫码用户当前记录");
  } finally {
    release();
  }
  await expect.poll(() => completed).toBe(true);
  await expect(records).not.toContainText("扫码用户迟到记录");
});
