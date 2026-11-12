import { API_BASE } from "../config";
import { publicRequest } from "./transport";
import { uid } from "./ids";
import {
  AuthCancelledError,
  SessionExpiredError,
  errorMessage,
} from "./errors";
import type { LoginPurpose } from "./login-context";
import type { Session, LoginResponse, PendingLogin, LoginExchange } from "./session-types";
let pendingLogin: PendingLogin | undefined;
let exchange: LoginExchange | undefined;
let authGeneration = 0;
function storedSession() {
  return wx.getStorageSync("douboSession") as Session | undefined;
}
export function storedToken() {
  return storedSession()?.token || "";
}
export function sessionToken() {
  const s = storedSession();
  return s && s.expiresAt > Date.now() ? s.token : "";
}
export function hasSession() {
  return !!sessionToken();
}
export function sessionUserId() {
  return storedSession()?.userId || "";
}
export function clearSession() {
  authGeneration++;
  wx.removeStorageSync("douboSession");
  wx.removeStorageSync("token");
  wx.removeStorageSync("analytics-consent");
  wx.removeStorageSync("autoplay-preference");
}
export function completeLogin() {
  const p = pendingLogin;
  pendingLogin = undefined;
  if (hasSession()) p?.resolve();
  else p?.reject(new SessionExpiredError());
}
export function cancelLogin() {
  authGeneration++;
  const p = pendingLogin;
  pendingLogin = undefined;
  p?.reject(new AuthCancelledError());
}
export function captureLoginFlow() {
  const flow = pendingLogin;
  const generation = authGeneration;
  const current = () => pendingLogin === flow && authGeneration === generation;
  return {
    complete() {
      if (current()) completeLogin();
    },
    cancel() {
      if (current()) cancelLogin();
    },
  };
}
export function login(purpose: LoginPurpose = "default"): Promise<void> {
  if (hasSession()) return Promise.resolve();
  if (pendingLogin) return pendingLogin.promise;
  let resolve!: () => void, reject!: (e: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const flow = { promise, resolve, reject };
  pendingLogin = flow;
  wx.navigateTo({
    url:
      "/pages/login/index" +
      (purpose === "default" ? "" : "?purpose=" + purpose),
    fail() {
      if (pendingLogin === flow) cancelLogin();
    },
  });
  return promise;
}
export async function signIn(mode: "wechat" | "demo" = "wechat", phoneCode?: string) {
  const generation = authGeneration;
  if (exchange?.generation === generation) {
    if (exchange.mode !== mode || exchange.phoneCode !== phoneCode) throw new Error("请等待当前登录完成");
    return exchange.promise;
  }
  const attempt = { generation, mode, phoneCode, promise: Promise.resolve() };
  attempt.promise = (async () => {
    let body: object;
    let endpoint = "/auth/wechat";
    if (mode === "wechat") {
      let result: WechatMiniprogram.LoginSuccessCallbackResult;
      try {
        result = await wx.login({ timeout: 10000 });
      } catch (e) {
        if (generation !== authGeneration) throw new AuthCancelledError();
        throw new Error(
          "微信登录失败：" + errorMessage(e, "未能获取登录凭证，请重试"),
        );
      }
      if (generation !== authGeneration) throw new AuthCancelledError();
      if (!result?.code) throw new Error("未能获取微信登录凭证，请重试");
      body = { code: result.code, ...(phoneCode ? { phoneCode } : {}) };
    } else {
      let id = wx.getStorageSync("demoId");
      if (!id) {
        id = uid();
        wx.setStorageSync("demoId", id);
      }
      body = { demoId: id };
      endpoint = "/auth/login";
    }
    const result = await publicRequest<LoginResponse>(endpoint, "POST", body);
    if (
      !result ||
      typeof result.token !== "string" ||
      !result.token ||
      typeof result.userId !== "string" ||
      !result.userId ||
      !Number.isFinite(result.expiresIn) ||
      result.expiresIn <= 30 ||
      result.provider !== mode
    ) {
      throw new Error("登录响应异常，请重试");
    }
    if (generation !== authGeneration) throw new AuthCancelledError();
    wx.setStorageSync("activation-required", !!result.activationRequired);
    wx.setStorageSync("douboSession", {
      token: result.token,
      userId: result.userId,
      provider: result.provider,
      expiresAt: Date.now() + result.expiresIn * 1000 - 30000,
    });
    wx.removeStorageSync("token");
  })();
  exchange = attempt;
  try {
    await attempt.promise;
  } finally {
    if (exchange === attempt) exchange = undefined;
  }
}
export async function logout() {
  // Revocation must complete before clearing local credentials; do not silently
  // leave a live server session behind when the network is unavailable.
  const old = storedSession();
  if (old?.token) {
    await new Promise<void>((resolve, reject) =>
      wx.request({
        url: API_BASE + "/api/auth/logout",
        method: "POST",
        data: {},
        header: { Authorization: "Bearer " + old.token },
        timeout: 20000,
        success(r) {
          if (
            r.statusCode === 401 ||
            (r.statusCode >= 200 && r.statusCode < 300)
          ) {
            resolve();
            return;
          }
          reject(
            new Error(
              (r.data as { error?: string })?.error || "退出失败，请重试",
            ),
          );
        },
        fail() {
          reject(new Error("连接失败，请检查网络后重新退出"));
        },
      }),
    );
    const current = storedSession()?.token;
    if (current && current !== old.token)
      throw new Error("登录状态已更新，请重新退出");
  }
  clearSession();
  cancelLogin();
  wx.removeStorageSync("edit-draft");
  wx.removeStorageSync("mix-draft");
  wx.removeStorageSync("mix-add-asset");
  wx.removeStorageSync("mix-source-text");
  for (const key of wx.getStorageInfoSync?.().keys || []) {
    if (key.startsWith("pending-") || key.startsWith("retry-"))
      wx.removeStorageSync(key);
  }
}
