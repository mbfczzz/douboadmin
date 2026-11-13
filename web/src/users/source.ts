import type { Profile } from "../business/types";

export const sourceLabel = (source?: string) =>
  ({ miniprogram: "小程序", app: "App", other: "其他" })[source || ""] ||
  "未知";
export const initialSource = (profile: Profile) =>
  profile.source ||
  (profile.authProvider === "wechat" ? "miniprogram" : "other");
