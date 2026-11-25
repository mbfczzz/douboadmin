import { API_BASE } from "../config";
import { sessionToken } from "./session";
import { AuthCancelledError, RequestError } from "./errors";
import type { EstimateInput, Estimate } from "./estimate-types";
import { points } from "./business";
import { clientCapabilityHeaders } from "./client-capabilities";
export type { EstimateInput } from "./estimate-types";
export function estimateCost(input: EstimateInput, owner: string) {
  let task: WechatMiniprogram.RequestTask | undefined;
  const promise = new Promise<Estimate>((resolve, reject) => {
    if (!owner || sessionToken() !== owner) {
      reject(new AuthCancelledError());
      return;
    }
    const query = Object.entries(input)
      .map(([key, value]) => key + "=" + encodeURIComponent(value ?? ""))
      .join("&");
    // Background pricing must never open login, activation, or error dialogs.
    task = wx.request({
      url: API_BASE + "/api/jobs/estimate?" + query,
      method: "GET",
      header: { ...clientCapabilityHeaders, Authorization: "Bearer " + owner },
      timeout: 10000,
      success(res) {
        if (sessionToken() !== owner) return reject(new AuthCancelledError());
        if (res.statusCode < 200 || res.statusCode >= 300)
          return reject(new RequestError(res.statusCode, "积分暂无法估算"));
        const value = res.data as Estimate;
        if (
          !value ||
          !Number.isSafeInteger(value.units) ||
          value.units < 0 ||
          typeof value.billingEnabled !== "boolean" ||
          (!value.billingEnabled && value.units !== 0)
        )
          return reject(new Error("积分报价无效"));
        resolve(value);
      },
      fail: () => reject(new Error("积分暂无法估算")),
    });
  });
  return { promise, abort: () => task?.abort() };
}

// 按秒 when the price comes from the video duration table, 按量 when it is the
// most a task can cost (settled on usage), else 按次.
export function quoteParts(q: Estimate, duration = 0) {
  if (!q.units) return { quoteMode: "", quoteRate: "", quoteText: "本次不扣积分" };
  if (q.perToken) return { quoteMode: "按量", quoteRate: "按实际用量扣除，多余退回", quoteText: `最多 ${points(q.units)} 积分` };
  const perSecond = !!q.perSecond && duration > 0;
  return {
    quoteMode: perSecond ? "按秒" : "按次",
    quoteRate: perSecond ? `每秒 ${points(Math.round(q.units / duration))} 积分 × ${duration} 秒` : "",
    quoteText: `本次 ${points(q.units)} 积分`,
  };
}
