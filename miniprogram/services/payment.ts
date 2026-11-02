import { request } from "./request";
import { uid } from "./ids";
import { AuthCancelledError } from "./errors";
import { sessionToken } from "./session";
import type { Row } from "./types";
import type { WalletInfo, Order } from "./business";

export function amountFen(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return 0;
  const pair = value.trim().split(".");
  const n = Number(pair[0]) * 100 + Number((pair[1] || "").padEnd(2, "0"));
  return Number.isSafeInteger(n) ? n : 0;
}
export function devicePlatform() {
  return wx.getDeviceInfo
    ? wx.getDeviceInfo().platform
    : wx.getSystemInfoSync().platform;
}
export function canRecharge(info: WalletInfo) {
  return (
    info.paymentReady &&
    info.pricing?.ready !== false &&
    info.settings.rechargeEnabled &&
    (devicePlatform() !== "ios" || info.iosPayment)
  );
}

export async function recharge(info: WalletInfo, fen: number) {
  if (!canRecharge(info)) throw new Error("当前暂未开放充值");
  const owner = info.wallet.userId,
    hash = JSON.stringify({
      owner,
      fen,
      version: info.settingsVersion,
      ...(info.pricing?.version ? { pricing: info.pricing.version } : {}),
    });
  let draft = wx.getStorageSync("pending-recharge") as
    { hash: string; key: string; id?: string } | undefined;
  if (!draft || draft.hash !== hash) {
    draft = { hash, key: uid() };
    wx.setStorageSync("pending-recharge", draft);
  }
  if (!draft.id) {
    const row = await request<Row<Order>>(
      "/orders",
      "POST",
      {
        amountFen: fen,
        settingsVersion: info.settingsVersion,
        pricingVersion: info.pricing?.version || "",
        platform: devicePlatform(),
      },
      draft.key,
    );
    draft.id = row.id;
    wx.setStorageSync("pending-recharge", draft);
  }
  return payExisting(draft.id);
}

export async function payExisting(id: string) {
  const info = await request<WalletInfo>("/wallet");
  if (!canRecharge(info)) throw new Error("当前设备或服务暂未开放充值");
  const token = sessionToken();
  const row = await request<Row<Order>>("/orders/" + id);
  if (row.data.status === "paid") {
    clearDraft(id);
    return row;
  }
  if (
    row.data.status !== "created" ||
    Date.parse(row.data.expiresAt) <= Date.now()
  ) {
    clearDraft(id);
    throw new Error("此订单已结束或过期，请重新充值");
  }
  const params = await request<{
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: "RSA";
    paySign: string;
  }>("/orders/" + id + "/pay", "POST", { platform: devicePlatform() });
  if (!token || sessionToken() !== token) throw new AuthCancelledError();
  await new Promise<void>((resolve, reject) =>
    wx.requestPayment({
      ...params,
      success: () => resolve(),
      fail: (e) =>
        reject(
          e.errMsg.includes("cancel")
            ? new AuthCancelledError()
            : new Error("支付未完成，请查看订单状态"),
        ),
    }),
  );
  if (sessionToken() !== token) throw new AuthCancelledError();
  try {
    await request("/orders/" + id + "/refresh", "POST", {});
  } catch {
    /* The server notification or reconciliation remains authoritative. */
  }
  const confirmed = await request<Row<Order>>("/orders/" + id);
  if (confirmed.data.status === "paid") clearDraft(id);
  return confirmed;
}

function clearDraft(id: string) {
  const draft = wx.getStorageSync("pending-recharge") as
    { id?: string } | undefined;
  if (draft?.id === id) wx.removeStorageSync("pending-recharge");
}
