import { API_BASE } from "../config";
import { sessionToken, storedToken, clearSession } from "./session";
import { AuthCancelledError, RequestError } from "./errors";

import type { AccessStatus } from "./access-types";
export type { AccessStatus } from "./access-types";

let redirecting = false;
let pending: { token: string; promise: Promise<AccessStatus> } | undefined;
export function resetAccessNavigation() {
  redirecting = false;
}
export function activationRedirect() {
  if (
    redirecting ||
    getCurrentPages().slice(-1)[0]?.route === "pages/activate/index"
  )
    return;
  redirecting = true;
  wx.reLaunch({
    url: "/pages/activate/index",
    fail: () => {
      redirecting = false;
    },
  });
}
export function accessStatus(): Promise<AccessStatus> {
  const token = sessionToken();
  if (!token) return Promise.resolve({ active: false, status: "login" });
  if (pending?.token === token) return pending.promise;
  const promise = new Promise<AccessStatus>((resolve, reject) => {
    wx.request({
      url: API_BASE + "/api/access",
      header: { Authorization: "Bearer " + token },
      timeout: 15000,
      success(r) {
        if (sessionToken() !== token) {
          if (!sessionToken() && storedToken() === token) {
            clearSession();
            resolve({ active: false, status: "login" });
            return;
          }
          reject(new AuthCancelledError());
          return;
        }
        if (r.statusCode === 401) {
          clearSession();
          resolve({ active: false, status: "login" });
          return;
        }
        const data = r.data as AccessStatus & { error?: string };
        if (r.statusCode >= 400 || typeof data.active !== "boolean") {
          reject(
            new RequestError(r.statusCode, data.error || "授权状态读取失败"),
          );
          return;
        }
        resolve(data);
      },
      fail() {
        reject(new Error("连接失败，请检查网络后重试"));
      },
    });
  });
  const attempt = { token, promise };
  pending = attempt;
  void promise.then(
    () => {
      if (pending === attempt) pending = undefined;
    },
    () => {
      if (pending === attempt) pending = undefined;
    },
  );
  return promise;
}
export async function enforceAccess(path: string) {
  if (["pages/activate/index", "pages/login/index"].includes(path)) return;
  try {
    if (!(await canEnter())) activationRedirect();
  } catch (e) {
    // Only a definite refusal leaves the page. Network, 5xx and 429 keep the
    // user where they are so drafts and uploads survive a brief outage.
    if (e instanceof RequestError && e.status === 403) activationRedirect();
  }
}

export async function canEnter() {
  const status = await accessStatus();
  return status.active || !!status.canBrowse;
}
// A provider's share code: 8 unambiguous characters. Accepts the scanned QR
// content (DOUBO-SHARE:CODE) or a typed code with spaces or dashes.
export function shareFrom(value: string) {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/^DOUBO-SHARE:/, "")
    .replace(/[\s-]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code))
    throw new Error("请扫描服务商的分享二维码或输入 8 位分享码");
  return code;
}
