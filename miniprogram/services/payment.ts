import { request } from "./request";
import { uid } from "./ids";
import { AuthCancelledError, PaymentCancelledError } from "./errors";
import { sessionToken, sessionUserId } from "./session";
import { money } from "./business";
import type { Row } from "./types";
import type { WalletInfo, Order } from "./business";
import type { PurchaseMode } from "./virtual-amount";
import {
  createVirtualOrder,
  invokeVirtualPayment,
  supportsVirtualPayment,
} from "./virtual-payment";
import {
  clearPayment,
  pendingPayments,
  rememberPayment,
} from "./payment-status";

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
    (info.paymentChannel === "wechat_virtual" ||
      info.settings.rechargeEnabled) &&
    (info.paymentChannel !== "wechat_virtual" ||
      supportsVirtualPayment(devicePlatform())) &&
    (devicePlatform() !== "ios" || info.iosPayment)
  );
}

export async function recharge(
  info: WalletInfo,
  fen: number,
  productId = "",
  mode: PurchaseMode = "package",
) {
  const token = sessionToken();
  if (!token || sessionUserId() !== info.wallet.userId)
    throw new AuthCancelledError();
  if (!canRecharge(info)) throw new Error("当前暂未开放充值");
  const s = info.settings;
  if (
    info.paymentChannel !== "wechat_virtual" &&
    (fen < s.minRechargeFen || fen > s.maxRechargeFen)
  )
    throw new Error(
      `请输入 ${money(s.minRechargeFen)}–${money(s.maxRechargeFen)} 元`,
    );
  if (info.paymentChannel === "wechat_virtual") {
    const row = await createVirtualOrder(
      info,
      productId,
      devicePlatform(),
      mode,
      fen,
      token,
    );
    return payExisting(row.id, token);
  }
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
      true,
      token,
    );
    if (sessionToken() !== token) throw new AuthCancelledError();
    draft.id = row.id;
    wx.setStorageSync("pending-recharge", draft);
  }
  return payExisting(draft.id, token);
}

export async function payExisting(id: string, expectedToken?: string) {
  const info = await request<WalletInfo>(
    "/wallet",
    "GET",
    undefined,
    undefined,
    true,
    expectedToken,
  );
  const token = sessionToken();
  const row = await request<Row<Order>>("/orders/" + id);
  if (row.data.status === "paid") {
    clearPayment(id);
    return row;
  }
  if (row.data.status !== "created") {
    clearPayment(id);
    throw new Error("此订单已结束或过期，请重新充值");
  }
  if (pendingPayments(info.wallet.userId).includes(id)) return row;
  if (Date.parse(row.data.expiresAt) <= Date.now()) {
    clearPayment(id);
    throw new Error("此订单已结束或过期，请重新充值");
  }
  if (!canRecharge(info)) throw new Error("当前设备或服务暂未开放充值");
  if (row.data.channel === "wechat_virtual") {
    await invokeVirtualPayment(
      row,
      info.wallet.userId,
      token,
      devicePlatform(),
    );
    return confirmPayment(row, info.wallet.userId, token);
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
            ? new PaymentCancelledError()
            : new Error("支付未完成，请查看订单状态"),
        ),
    }),
  );
  if (sessionToken() !== token) throw new AuthCancelledError();
  return confirmPayment(row, info.wallet.userId, token);
}

async function confirmPayment(row: Row<Order>, owner: string, token: string) {
  const id = row.id;
  rememberPayment(id, owner);
  try {
    await request("/orders/" + id + "/refresh", "POST", {});
  } catch {
    /* The server notification or reconciliation remains authoritative. */
  }
  if (sessionToken() !== token) throw new AuthCancelledError();
  try {
    const confirmed = await request<Row<Order>>("/orders/" + id);
    if (confirmed.data.status !== "created") clearPayment(id);
    return confirmed;
  } catch (error) {
    if (sessionToken() !== token) throw new AuthCancelledError();
    // The payment sheet completed. Keep tracking instead of reporting a payment failure.
    return row;
  }
}
