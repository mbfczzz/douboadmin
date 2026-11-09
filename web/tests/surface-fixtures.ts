import type { Page } from "@playwright/test";

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

// Browser-only read fixtures. Writes are blocked; no payments or quotas are changed.
export async function surfaceFixtures(page: Page) {
  const models = await (await page.request.get("/api/admin/models")).json();
  const imageModel = models.find(
    (r: { data: { kind: string } }) => r.data.kind === "image",
  );
  const partner = row("qa-provider", {
      name: longName,
      parentId: "root",
      path: ["root"],
      status: "active",
      retailPer100Fen: 10000,
      childMarginBps: 5000,
    }),
    childPartner = row("qa-child", {
      name: "质检子级服务商",
      parentId: "qa-provider",
      path: ["root", "qa-provider"],
      status: "active",
      retailPer100Fen: 12000,
      childMarginBps: 3000,
    }),
    partnerTree = [
      {
        record: partner,
        quota: {
          users: { granted: 20, used: 1, reserved: 1, allocated: 9 },
        },
      },
      {
        record: childPartner,
        quota: {
          users: { granted: 4, used: 1, reserved: 0, allocated: 0 },
        },
      },
    ];
  const membership = {
    partnerId: "root",
    status: "active",
    codeId: "qa-code",
    activatedAt: now,
  };
  const code = row("qa-code", {
    partnerId: "root",
    partnerName: "总账号",
    label: "界面质检授权码",
    suffix: "TEST",
    status: "pending",
    expiresAt: "2026-12-01T00:00:00Z",
    actor: "admin",
    creatorAccount: "admin",
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
        kind: "image",
        model: imageModel?.id || "",
        resolution: imageModel?.data.resolutions[0] || "",
        ratio: imageModel?.data.ratios[0] || "",
        quality: "",
        mode: "",
        duration: 0,
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
    "/users": [
      row("qa-user", { nickname: "界面质检用户", name: "", phone: "" }),
    ],
    "/users/qa-user/wallet": {
      wallet: { availableUnits: 12345, heldUnits: 200 },
    },
    "/users/qa-user/ledger": [],
    "/jobs": [job],
    "/jobs/qa-job/execution": {
      phase: "polling",
      taskId: "test-task",
      modelKey: "test-model",
      note: "上游状态：processing",
      startedAt: now,
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
    "/quota-moves": list([]),
    "/quota-requests": list([
      row("qa-request", {
        partnerId: "qa-provider",
        parentId: "root",
        users: 2,
        partners: 1,
        status: "pending",
        reason: "界面质检申请",
      }),
    ]),
    "/activation-codes": list([code]),
    "/activation-codes/qa-code": {
      code: "AAAABBBBCCCCDDDDEEEE",
      qr: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAAFAAQMAAAD3XjfpAAAABlBMVEX///8AAABVwtN+AAABm0lEQVR42uyaO5KzQAyERTmYkCNwFI4GR+MocwTCCVz0X5JmwI+fddUuDA66k334y1RStzQWiqIoivqlGmRFaSDS2u/zrfx3IngdONrPIQZA+jksMkxyg39K8FKwAyBD1L96pMZLKANwJ3gyiEl7ZuwJfhUYFpF+9iYi+BVgnmar5XgJ98cewb+BxdjDoj2TGgd/SAAEq4DP6udgJfwYjQmeDuo0M1uJKwjM3m2lxQheAYqIgu42GdGOApBuL81F8AAwTzP3GTd2qKXLgPS/jZ1gTdCGV5fM8MOaALr3EhKsCCqiqRe6Ooq0SZurvYt22/3FaggeCI4dlryxj33OWwSvBHVNaW14YcmF9DA8SnjbCwlWBA2BZquAfPDNG7tGLoKHg5ZxNWFFz1mbYgDBC8FNfmH3HaSc3AleBz68Sr0cfOPueyHBOuDT/XFe0zHB08Dtwu6VKUqye4onWBM0n/FpZnvLbgkJVga1hNZctqbk7WUieDy4TTO19/JdheHtrEiwMvjwKlVuKfLpvZDg+SBFURRFmf4FAAD//13EXvMqiHVCAAAAAElFTkSuQmCC",
    },
    "/activation-codes/qa-code/trace": {
      record: code,
      partnerName: "总账号",
      user: { id: "qa-user", nickname: "质检用户", name: "" },
      currentMembership: membership,
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
    if (path === "/partners/tree") return route.fulfill({ json: partnerTree });
    if (path === "/partners")
      return route.fulfill({
        json: list(
          url.searchParams.get("owner") === "qa-provider" ? [] : [partner],
        ),
      });
    if (path === "/partners/root" || path === "/partners/qa-provider")
      return route.fulfill({
        json: {
          record: path.endsWith("/root")
            ? row("root", { ...(partner.data as object), name: "总账号" })
            : partner,
          quota: {
            users: { granted: 20, used: 1, reserved: 1, allocated: 9 },
            partners: { granted: 1, used: 1, reserved: 0, allocated: 0 },
          },
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
    if (path in maps) return route.fulfill({ json: maps[path] });
    return route.fallback();
  });
  return models;
}
