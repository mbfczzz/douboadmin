import { API_BASE } from "../config";
import { sessionToken } from "./session";
import { AuthCancelledError, RequestError } from "./errors";
import type { EstimateInput, Estimate } from "./estimate-types";
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
      header: { Authorization: "Bearer " + owner },
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
