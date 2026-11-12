import type { Page } from "@playwright/test";
import { pagedFixture } from "./paged-fixture";
import { surfaceCode } from "./surface-code-fixture";
import type { Row, Model } from "../src/api";

const now = "2026-11-02T00:00:00Z";
const row = (id: string, data: unknown) => ({
  id,
  version: 1,
  createdAt: now,
  data,
});
const list = (items: unknown[]) => ({
  items,
  page: 1,
  size: 20,
  total: items.length,
});
export const longName = "QualityControlProvider".repeat(2) + "International";
export const qr =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAAFAAQMAAAD3XjfpAAAABlBMVEX///8AAABVwtN+AAABm0lEQVR42uyaO5KzQAyERTmYkCNwFI4GR+MocwTCCVz0X5JmwI+fddUuDA66k334y1RStzQWiqIoivqlGmRFaSDS2u/zrfx3IngdONrPIQZA+jksMkxyg39K8FKwAyBD1L96pMZLKANwJ3gyiEl7ZuwJfhUYFpF+9iYi+BVgnmar5XgJ98cewb+BxdjDoj2TGgd/SAAEq4DP6udgJfwYjQmeDuo0M1uJKwjM3m2lxQheAYqIgu42GdGOApBuL81F8AAwTzP3GTd2qKXLgPS/jZ1gTdCGV5fM8MOaALr3EhKsCCqiqRe6Ooq0SZurvYt22/3FaggeCI4dlryxj33OWwSvBHVNaW14YcmF9DA8SnjbCwlWBA2BZquAfPDNG7tGLoKHg5ZxNWFFz1mbYgDBC8FNfmH3HaSc3AleBz68Sr0cfOPueyHBOuDT/XFe0zHB08Dtwu6VKUqye4onWBM0n/FpZnvLbgkJVga1hNZctqbk7WUieDy4TTO19/JdheHtrEiwMvjwKlVuKfLpvZDg+SBFURRFmf4FAAD//13EXvMqiHVCAAAAAElFTkSuQmCC";

// Browser-only read fixtures. Writes are blocked; no payments or providers change.
export async function surfaceFixtures(page: Page, catalog?: Row<Model>[]) {
  const models = catalog || await (await page.request.get("/api/admin/models")).json();
  const videoModel = models.find(
    (r: { data: { kind: string } }) => r.data.kind === "video",
  );
  const partner = row("qa-provider", {
      name: longName,
      role: "branch",
      parentId: "root",
      path: ["root"],
      status: "active",
      retailPer100Fen: 10000,
      childMarginBps: 5000,
    }),
    childPartner = row("qa-child", {
      name: "质检子级服务商",
      role: "s1",
      parentId: "qa-provider",
      path: ["root", "qa-provider"],
      status: "active",
      retailPer100Fen: 12000,
      childMarginBps: 3000,
    }),
    partnerTree = [partner, childPartner];
  const membership = {
    partnerId: "qa-provider",
    status: "active",
    codeId: "ABCD2345",
    method: "scan",
    referrer: "qa-referrer",
    activatedAt: now,
  };
  const registration = row("qa-user", {
    role: "member",
    partnerId: "qa-provider",
    referrer: "qa-referrer",
    codeKind: "promo",
    code: "PRMO2345",
    method: "scan",
    name: "质检登记用户",
    phone: "13900000002",
    status: "pending",
  });
  const job = {
    id: "qa-job",
    userId: "qa-user",
    status: "failed",
    input: {
      kind: "image",
      prompt: "long-prompt-" + "x".repeat(150),
      model: "test-model",
      resolution: "1k",
      ratio: "1:1",
      duration: 0,
      assets: [],
    },
    modelName: "质检模型",
    progress: 100,
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    result: "/media/design/cover-1.jpg",
    error: "界面异常展示样例",
    billingState: "reserved",
    retryable: true,
    demo: false,
  };
  const maps: Record<string, unknown> = {
    "/templates": [
      row("qa-template", {
        title: "弹窗质检模板",
        category: "测试分类",
        family: "style",
        kind: "video",
        model: videoModel?.id || "",
        resolution: videoModel?.data.resolutions[0] || "",
        ratio: videoModel?.data.ratios[0] || "",
        quality: "",
        mode: "",
        duration: videoModel?.data.durations[0] || 5,
        cover: "/media/design/cover-1.jpg",
        prompt: "只读界面验收提示词",
        description: "只读测试模板，不写入业务数据库",
        published: false,
        sort: 0,
        requiredImages: 0,
      }),
    ],
    "/accounts": {
      canManage: true,
      items: [
        row("qa-admin", {
          username: "qa-admin",
          name: "质检管理员",
          phone: "13800138000",
          role: "super_admin",
          disabled: false,
          lastLoginAt: now,
        }),
      ],
    },
    "/models": models,
    "/users": {
      items: [
        row("qa-user", { nickname: "界面质检用户", name: "", phone: "" }),
      ],
      page: 1,
      size: 20,
      total: 1,
    },
    "/users/qa-user/wallet": {
      wallet: { availableUnits: 12345, heldUnits: 200 },
    },
    "/users/qa-user/ledger": [],
    "/jobs": [job],
    "/jobs/qa-job/detail": {
      job,
      inputs: [
        {
          id: "qa-img",
          kind: "image",
          mime: "image/jpeg",
          size: 2048,
          url: "/media/design/cover-1.jpg",
          label: "图片 1",
        },
      ],
      execution: {
        phase: "polling",
        taskId: "test-task",
        modelKey: "test-model",
        startedAt: now,
      },
      calls: [],
      polls: 0,
      morePolls: false,
    },
    "/works": [
      { ...job, status: "succeeded", reviewStatus: "approved", error: "" },
    ],
    "/reviews": [
      {
        record: row("qa-review", { status: "pending" }),
        job: { ...job, status: "succeeded" },
      },
    ],
    "/orders": [
      row("qa-order", {
        userId: "qa-user",
        status: "paid",
        amountFen: 10000,
        pointsUnits: 1000000,
        transactionId: "qa-transaction",
        expiresAt: now,
      }),
    ],
    "/refunds": [
      row("qa-refund", {
        orderId: "qa-order",
        userId: "qa-user",
        amountFen: 10000,
        status: "processing",
        reason: "界面质检",
      }),
    ],
    "/registrations": list([registration]),
    "/users/qa-user/activation": {
      kind: "member",
      membership,
      registration: { ...registration.data, status: "approved" },
      referrer: { id: "qa-referrer", name: "推荐会员", nickname: "小李" },
      chain: [
        {
          id: "qa-provider",
          name: "质检分公司",
          role: "branch",
          status: "active",
        },
      ],
    },
    "/memberships": list([row("qa-user", membership)]),
    "/partner-policy": row("distribution", {
      enabled: true,
      costPer100Fen: 8000,
      rootMarginBps: 5000,
    }),
    "/commission-ledger": list([
      row("qa-commission", {
        partnerId: "root",
        orderId: "qa-order",
        kind: "recharge",
        amountFen: 2000,
        heldDelta: 0,
        balanceAfter: 20000,
        note: "质检流水",
      }),
    ]),
    "/commission-payouts": list([
      row("qa-payout", {
        partnerId: "root",
        amountFen: 1000,
        status: "pending",
        note: "质检提现",
      }),
    ]),
    "/orders/qa-order/distribution": {
      orderId: "qa-order",
      userId: "qa-user",
      amountFen: 10000,
      pointsUnits: 1000000,
      status: "paid",
      distribution: {
        costFen: 8000,
        retailPer100Fen: 10000,
        shares: [{ partnerId: "root", name: "总账号", amountFen: 2000 }],
      },
    },
  };
  await page.route("**/api/admin/**", async (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({
        status: 409,
        json: { error: "只读界面验收，禁止提交" },
      });
    const url = new URL(route.request().url()),
      path = url.pathname.replace("/api/admin", "");
    if (path === "/partners/tree") {
      const rows = url.searchParams.has("page") ? partnerTree
        .filter((r) => r.data.parentId === (url.searchParams.get("parent") || "root"))
        .map((r) => ({ ...r, children: partnerTree.filter((c) => c.data.parentId === r.id).length })) : partnerTree;
      return route.fulfill({ json: pagedFixture(rows, url) });
    }
    if (path === "/partners")
      return route.fulfill({
        json: list(
          url.searchParams.get("owner") === "qa-provider" ? [] : [partner],
        ),
      });
    const code = surfaceCode(path, qr);
    if (code) return route.fulfill({ json: code });
    const record = partnerTree.find((r) => path === "/partners/" + r.id);
    if (record)
      return route.fulfill({
        json: {
          record,
          price: {
            enabled: true,
            version: "qa",
            costPer100Fen: 8000,
            incomingPer100Fen: 8000,
            retailPer100Fen: 10000,
            shares: [{ partnerId: "root", name: "总账号", amountFen: 2000 }],
          },
          commission: { balanceFen: 20000, heldFen: 1000, paidOutFen: 0 },
        },
      });
    if (path === "/templates/categories") return route.fulfill({ json: ["测试分类"] });
    if (path in maps) return route.fulfill({ json: pagedFixture(maps[path], url) });
    return route.fallback();
  });
  return models;
}
