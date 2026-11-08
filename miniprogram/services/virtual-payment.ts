import { request } from "./request";
import { uid } from "./ids";
import { sessionToken } from "./session";
import { AuthCancelledError, PaymentCancelledError } from "./errors";
import { rememberPayment, clearPayment } from "./payment-status";
import type { WalletInfo, Order } from "./business";
import type { Row } from "./types";
import { customError } from "./virtual-amount";
import type { PurchaseMode } from "./virtual-amount";
import {
  virtualFailureCancelled,
  virtualFailureCode,
  virtualFailureDetail,
  virtualFailureError,
} from "./virtual-failure";

export function supportsVirtualPayment(platform: string) {
  if (typeof wx.requestVirtualPayment !== "function") return false;
  if (wx.canIUse && !wx.canIUse("requestVirtualPayment")) return false;
  if (platform !== "ios") return true;
  const base = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
  const device = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
  const version = (base.version || "").split(".").map(Number);
  const supported =
    version[0] > 8 ||
    (version[0] === 8 &&
      (version[1] > 0 || (version[1] === 0 && version[2] >= 68)));
  return (
    supported && Number((device.system || "").match(/\d+/)?.[0] || 0) >= 15
  );
}

export async function createVirtualOrder(
  info: WalletInfo,
  productId: string,
  platform: string,
  mode: PurchaseMode = "package",
  fen = 0,
  token = sessionToken(),
) {
  const product = info.virtualProducts?.find((item) => item.id === productId);
  if (mode === "custom") {
    const problem = customError(info, fen, platform);
    if (problem) throw new Error(problem);
  } else if (!product) throw new Error("请选择可用的积分商品");
  return request<Row<Order>>(
    "/orders",
    "POST",
    {
      ...(mode === "custom"
        ? {
            purchaseMode: mode,
            productId: info.virtualCustom!.productId,
            amountFen: fen,
          }
        : { productId, amountFen: product!.amountFen }),
      settingsVersion: info.settingsVersion,
      expectedPointsUnits:
        mode === "custom"
          ? info.virtualCustom!.unitPointsUnits *
            (fen / info.virtualCustom!.unitAmountFen)
          : product!.pointsUnits,
      pricingVersion: info.pricing?.version || "",
      platform,
    },
    uid(),
    true,
    token,
  );
}

export async function invokeVirtualPayment(
  row: Row<Order>,
  owner: string,
  token: string,
  platform: string,
) {
  if (!supportsVirtualPayment(platform))
    throw new Error("请更新微信后重试，当前设备不支持虚拟支付");
  if (row.data.virtual?.issued) {
    rememberPayment(row.id, owner);
    return;
  }
  const code = await new Promise<string>((resolve, reject) =>
    wx.login({
      success: (result) =>
        result.code
          ? resolve(result.code)
          : reject(new Error("请重新微信登录")),
      fail: () => reject(new Error("无法获取微信支付凭证，请重试")),
    }),
  );
  if (!token || sessionToken() !== token) throw new AuthCancelledError();
  const params = await request<{
    channel: string;
    mode: "short_series_goods";
    signData: string;
    paySig: string;
    signature: string;
  }>("/orders/" + row.id + "/pay", "POST", { platform, code });
  if (sessionToken() !== token) throw new AuthCancelledError();
  if (
    params.channel !== "wechat_virtual" ||
    params.mode !== "short_series_goods" ||
    typeof params.signData !== "string" ||
    !params.paySig ||
    !params.signature
  )
    throw new Error("虚拟支付参数异常，请查询订单状态");
  rememberPayment(row.id, owner);
  await new Promise<void>((resolve, reject) =>
    wx.requestVirtualPayment({
      mode: params.mode,
      // Official API requires the ORIGINAL JSON string; typings incorrectly declare an object.
      signData: params.signData as unknown as WechatMiniprogram.SignData,
      paySig: params.paySig,
      signature: params.signature,
      success: () => resolve(),
      fail: (failure) => {
        if (virtualFailureCancelled(failure)) {
          clearPayment(row.id);
          reject(new PaymentCancelledError());
        } else {
          console.warn("[virtual-payment] 微信支付调用失败", {
            errCode: virtualFailureCode(failure),
            errMsg: virtualFailureDetail(failure, [
              params.signData,
              params.paySig,
              params.signature,
            ]),
            orderId: row.id,
            platform,
          });
          const error = virtualFailureError(failure);
          if (error) {
            clearPayment(row.id);
            reject(error);
          } else {
            // Unknown outcomes still require reconciliation before another purchase.
            resolve();
          }
        }
      },
    }),
  );
  if (sessionToken() !== token) throw new AuthCancelledError();
}
