import { API_BASE } from "../config";
import { RequestError } from "./errors";

// Authentication requests must not depend on the authenticated request wrapper.
export function publicRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" = "GET",
  data?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) =>
    wx.request({
      url: API_BASE + "/api" + path,
      method,
      data: data as object,
      header: { "Content-Type": "application/json" },
      timeout: 20000,
      success(r) {
        if (r.statusCode >= 400) {
          reject(
            new RequestError(
              r.statusCode,
              (r.data as { error?: string })?.error || "请求失败",
            ),
          );
          return;
        }
        resolve(r.data as T);
      },
      fail() {
        reject(new Error("连接失败，请检查网络后重试"));
      },
    }),
  );
}
