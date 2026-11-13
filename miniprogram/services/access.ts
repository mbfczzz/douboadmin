import { API_BASE } from "../config";
import { sessionToken, storedToken, forgetDeletedAccount, clearSession } from "./session";
import { AuthCancelledError, RequestError } from "./errors";
import { trialDebug } from "./trial-debug";

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
  const promise = trialDebug(
    () =>
      new Promise<AccessStatus>((resolve, reject) => {
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
            const data = r.data as AccessStatus & { error?: string; code?: string };
            if (r.statusCode === 403 && data.code === "ACCOUNT_DELETED") {
              forgetDeletedAccount();
              resolve({ active: false, status: "login" });
              return;
            }
            if (r.statusCode === 403 && data.code === "ACCOUNT_DISABLED") {
              resolve({ active: false, status: "account_disabled", message: data.error });
              return;
            }
            if (r.statusCode >= 400 || typeof data.active !== "boolean") {
              reject(
                new RequestError(
                  r.statusCode,
                  data.error || "授权状态读取失败",
                ),
              );
              return;
            }
            resolve(data);
          },
          fail() {
            reject(new Error("连接失败，请检查网络后重试"));
          },
        });
      }),
  );
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
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Codes show as two groups of four, "KMNP-2345"; the dash is only display
// (copying and submitting use the bare eight characters).
export const prettyCode = (code: string) =>
  code.length > 4 ? code.slice(0, 4) + "-" + code.slice(4) : code;
// A code as it is typed: upper case, only code characters, at most eight.
// `dropped` reports characters a code never has (I, O, 0, 1, symbols).
export function typedCode(value: string, previous = "") {
  const chars = [
    ...value
      .toUpperCase()
      .replace(/^DOUBO-SHARE:/, "")
      .replace(/[\s-]/g, ""),
  ];
  const raw = chars
    .filter((c) => CODE_CHARS.includes(c))
    .join("")
    .slice(0, 8);
  // Typing forward past the fourth character adds the dash at once; deleting
  // takes it away again, so it never blocks backspace.
  const growing = raw.length > previous.replace(/-/g, "").length;
  return {
    raw,
    shown: raw.length === 4 && growing ? raw + "-" : prettyCode(raw),
    dropped: chars.some((c) => !CODE_CHARS.includes(c)),
  };
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
