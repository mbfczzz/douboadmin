import { API_BASE } from "../config";
import { sessionToken, storedToken, clearSession } from "./session";
import { AuthCancelledError, RequestError } from "./errors";

export interface AccessStatus {
  active: boolean;
  status: string;
  partnerId?: string;
  partnerName?: string;
  message?: string;
}
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
    if (!(await accessStatus()).active) activationRedirect();
  } catch (e) {
    if (!(e instanceof AuthCancelledError)) activationRedirect();
  }
}
export function scannedActivation(value: string) {
  let input = value.trim();
  try {
    input = decodeURIComponent(input);
  } catch {
    throw new Error("二维码内容无效");
  }
  input = input
    .toUpperCase()
    .replace(/^DOUBO-ACTIVATE:/, "")
    .replace(/[\s-]/g, "");
  if (!/^[A-Z2-7]{20}$/.test(input))
    throw new Error("请扫描豆播授权二维码或输入完整激活码");
  return input;
}
