import { API_BASE } from "../config";
import { login, sessionToken, storedToken, clearSession } from "./session";
import {
  AuthCancelledError,
  SessionExpiredError,
  RequestError,
} from "./errors";
import { media } from "./media";
import type { Row, Asset, ResponseMeta } from "./types";
import { requestPurpose } from "./login-context";
import { activationRedirect } from "./access";
import { trialDebug } from "./trial-debug";
export function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  key?: string,
  auth = true,
  expectedToken?: string,
): Promise<T> {
  return (
    auth ? login(requestPurpose(path, method, data)) : Promise.resolve()
  ).then(
    () =>
      trialDebug(() => new Promise<T>((resolve, reject) => {
        const sentToken = sessionToken();
        const storedAtSend = storedToken();
        if (expectedToken !== undefined && sentToken !== expectedToken) {
          reject(new AuthCancelledError());
          return;
        }
        if (auth && !sentToken) {
          reject(
            storedToken()
              ? new SessionExpiredError()
              : new AuthCancelledError(),
          );
          return;
        }
        wx.request({
          url: API_BASE + "/api" + path,
          method,
          data: data as object,
          header: {
            "Content-Type": "application/json",
            ...(sentToken ? { Authorization: "Bearer " + sentToken } : {}),
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          timeout: 20000,
          success(res) {
            const meta = res.data as ResponseMeta;
            if (storedToken() !== storedAtSend) {
              reject(new AuthCancelledError());
              return;
            }
            if ((auth || sentToken) && res.statusCode === 401) {
              if (storedToken() === sentToken) clearSession();
              if (wx.getStorageSync("activation-required"))
                activationRedirect();
              reject(new SessionExpiredError());
              return;
            }
            if (
              res.statusCode === 403 &&
              meta?.code === "ACTIVATION_REQUIRED" &&
              !meta.access?.canBrowse
            ) {
              activationRedirect();
              reject(new AuthCancelledError());
              return;
            }
            if (
              res.statusCode === 401 &&
              !sentToken &&
              wx.getStorageSync("activation-required")
            ) {
              activationRedirect();
              reject(new AuthCancelledError());
              return;
            }
            if (res.statusCode >= 400) {
              reject(
                new RequestError(res.statusCode, meta?.error || "请求失败"),
              );
              return;
            }
            if (
              path === "/config" &&
              typeof meta?.activationRequired === "boolean"
            )
              wx.setStorageSync("activation-required", meta.activationRequired);
            resolve(res.data as T);
          },
          fail() {
            reject(new Error("连接失败，请检查网络后重试"));
          },
        });
      })),
  );
}
export function upload(
  path: string,
  avatar = false,
  expectedToken?: string,
): Promise<Row<Asset>> {
  return login(avatar ? "profile" : "upload").then(
    () =>
      new Promise((resolve, reject) => {
        const sentToken = sessionToken();
        if (expectedToken !== undefined && sentToken !== expectedToken) {
          reject(new AuthCancelledError());
          return;
        }
        if (!sentToken) {
          reject(
            storedToken()
              ? new SessionExpiredError()
              : new AuthCancelledError(),
          );
          return;
        }
        wx.uploadFile({
          url: API_BASE + "/api/assets" + (avatar ? "?purpose=avatar" : ""),
          filePath: path,
          name: "file",
          header: { Authorization: "Bearer " + sentToken },
          timeout: 90000,
          success(r) {
            try {
              if (storedToken() !== sentToken) throw new AuthCancelledError();
              if (r.statusCode === 401) {
                if (storedToken() === sentToken) clearSession();
                throw new SessionExpiredError();
              }
              const d = JSON.parse(r.data);
              if (
                r.statusCode === 403 &&
                d.code === "ACTIVATION_REQUIRED" &&
                !d.access?.canBrowse
              ) {
                activationRedirect();
                throw new AuthCancelledError();
              }
              if (r.statusCode >= 400)
                throw new RequestError(r.statusCode, d.error || "上传失败");
              d.data.url = media(d.data.url);
              resolve(d);
            } catch (e) {
              reject(e);
            }
          },
          fail() {
            reject(new Error("上传失败，请检查网络"));
          },
        });
      }),
  );
}
