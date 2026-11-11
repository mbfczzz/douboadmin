import type { NativeFailure } from "./types";

// Source: WeChat wx.requestVirtualPayment error table. Unknown results remain pending.
const rejected: Record<number, string> = {
  1001: "支付参数校验未通过，请联系管理员",
  [-15001]: "支付参数校验未通过，请联系管理员",
  [-15004]: "支付币种配置有误，请联系管理员",
  [-15005]: "微信登录签名校验失败，请重新登录后重试",
  [-15006]: "支付签名校验失败，请联系管理员核对支付配置",
  [-15007]: "微信登录信息已过期，请重新登录后重试",
  [-15008]: "商户支付配置尚未完成，请联系管理员",
  [-15009]: "支付商品尚未发布，请联系管理员",
  [-15010]: "该积分套餐尚未发布，请联系管理员",
  [-15011]: "支付环境配置不匹配，请联系管理员",
  [-15013]: "套餐价格与微信后台不一致，请联系管理员",
  [-15014]: "套餐发布尚未生效，请稍后再试",
  [-15016]: "支付数据格式校验未通过，请联系管理员",
  [-15018]: "套餐审核未通过，请联系管理员",
};

export class VirtualPaymentRejectedError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(`${message}（错误码 ${code}）`);
  }
}

export function virtualFailureCode(failure: NativeFailure) {
  const value = failure.errCode ?? failure.err_code;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const code = Number(value);
    if (Number.isSafeInteger(code)) return code;
  }
  return undefined;
}

export function virtualFailureCancelled(failure: NativeFailure) {
  return (
    virtualFailureCode(failure) === -2 ||
    /cancel/i.test(failure.errMsg || failure.err_msg || "")
  );
}

export function virtualFailureError(failure: NativeFailure) {
  const code = virtualFailureCode(failure);
  return code !== undefined && rejected[code]
    ? new VirtualPaymentRejectedError(code, rejected[code])
    : undefined;
}

export function virtualFailureDetail(
  failure: NativeFailure,
  privateValues: string[],
) {
  let message = failure.errMsg || failure.err_msg || "微信未返回错误说明";
  for (const value of privateValues
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    message = message.split(value).join("[hidden]");
    message = message.split(encodeURIComponent(value)).join("[hidden]");
  }
  return message
    .replace(
      /(["']?(?:paySig|pay_sig|signature|session_?key|access_?token|token|app_?key|secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "$1[hidden]",
    )
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}
