import { expect, test, type Locator } from "@playwright/test";
import { openCodes, titles, codes } from "./provider-code-fixture";
import { qr } from "./surface-fixtures";

async function geometry(dialog: Locator) {
  return dialog.evaluate((el) => {
    const rect = (node: Element) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      dialog: rect(el),
      card: rect(el.querySelector(".share-panel")!),
      qr: rect(el.querySelector(".share-qr-slot")!),
      records: rect(el.querySelector(".partner-records")!),
      scrollTop: el.querySelector(".provider-panel")!.scrollTop,
    };
  });
}
function expectStable(
  actual: Awaited<ReturnType<typeof geometry>>,
  before: Awaited<ReturnType<typeof geometry>>,
) {
  for (const key of ["dialog", "card", "qr", "records"] as const)
    for (const axis of ["x", "y", "width", "height"] as const)
      expect(
        Math.abs(actual[key][axis] - before[key][axis]),
        `${key}.${axis}`,
      ).toBeLessThanOrEqual(1);
  expect(actual.scrollTop).toBe(before.scrollTop);
}

for (const width of [1440, 390, 320]) {
  test(`first-load and cached tab switches keep the dialog stable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { dialog, requests } = await openCodes(page);
    const before = await geometry(dialog);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = false;
    await page.route("**/codes/s2", async (route) => {
      arrived = true;
      await pending;
      await route.fulfill({ json: { code: codes.s2, qr } });
    });
    await dialog.getByRole("tab", { name: titles.s2, exact: true }).click();
    await expect.poll(() => arrived).toBe(true);
    try {
      await expect(dialog.locator(".code-view")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(dialog.locator(".share-qr")).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "复制", exact: true }),
      ).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: "重置", exact: true }),
      ).toBeDisabled();
      expectStable(await geometry(dialog), before);
      await page.screenshot({
        path: `../.runtime/share-tab-loading-${width}.png`,
      });
    } finally {
      release();
    }
    await expect(dialog.locator(".share-code")).toHaveText("WXYZ-6789");
    expectStable(await geometry(dialog), before);
    await dialog.getByRole("tab", { name: titles.member, exact: true }).click();
    await expect(dialog.locator(".share-code")).toHaveText("ABCD-2345");
    expectStable(await geometry(dialog), before);
    await dialog.getByRole("tab", { name: titles.s1, exact: true }).click();
    await expect(dialog.locator(".share-code")).toHaveText("KMNP-2345");
    expect(requests.filter((request) => request === "GET:s1")).toHaveLength(1);
    expectStable(await geometry(dialog), before);
  });
}

test("failed tab load retains its layout, exposes retry and never shows the previous code", async ({
  page,
}) => {
  const { dialog } = await openCodes(page);
  const before = await geometry(dialog);
  let fail = true;
  await page.route("**/codes/s2", (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { error: "二维码读取暂时失败" } }
        : { json: { code: codes.s2, qr } },
    ),
  );
  await dialog.getByRole("tab", { name: titles.s2, exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("读取暂时失败");
  await expect(dialog.locator(".share-qr")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "复制", exact: true }),
  ).toBeDisabled();
  expectStable(await geometry(dialog), before);
  fail = false;
  await dialog.getByRole("button", { name: "重试", exact: true }).click();
  await expect(dialog.locator(".share-code")).toHaveText("WXYZ-6789");
  expectStable(await geometry(dialog), before);
});

test("reset refreshes only the current cached code and returning to it keeps the new code", async ({
  page,
}) => {
  const { dialog } = await openCodes(page);
  let current = codes.s1;
  let writes = 0;
  await page.route("**/codes/s1", (route) => {
    if (route.request().method() === "POST") {
      writes++;
      current = "RSTU6789";
    }
    return route.fulfill({ json: { code: current, qr } });
  });
  await dialog.getByRole("button", { name: "重置", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: `重置${titles.s1}？` });
  expect(writes).toBe(0);
  await confirm.getByRole("button", { name: "重置", exact: true }).click();
  await expect(dialog.locator(".share-code")).toHaveText("RSTU-6789");
  await dialog.getByRole("tab", { name: titles.member, exact: true }).click();
  await expect(dialog.locator(".share-code")).toHaveText("ABCD-2345");
  await dialog.getByRole("tab", { name: titles.s1, exact: true }).click();
  await expect(dialog.locator(".share-code")).toHaveText("RSTU-6789");
  expect(writes).toBe(1);
});

test("a late response from an abandoned tab cannot replace the selected code", async ({
  page,
}) => {
  const { dialog } = await openCodes(page);
  let release!: () => void;
  let arrived = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/codes/s2", async (route) => {
    arrived = true;
    await pending;
    await route.fulfill({ json: { code: codes.s2, qr } }).catch(() => {
      /* The browser aborted this tab's request. */
    });
  });
  await dialog.getByRole("tab", { name: titles.s2, exact: true }).click();
  await expect.poll(() => arrived).toBe(true);
  await dialog.getByRole("tab", { name: titles.member, exact: true }).click();
  release();
  await expect(dialog.locator(".share-code")).toHaveText("ABCD-2345");
  await expect(dialog.locator(".share-qr")).toHaveAttribute(
    "alt",
    titles.member + "二维码",
  );
});
