import type { Profile } from "../business/types";

// Same rule as the server: the current phone passed the SMS check.
export const phoneVerified = (p: Profile) =>
  !!p.phone && p.verifiedPhone === p.phone;

// Name plus verified phone; until then the user stays on the first step.
export const registered = (p: Profile) => !!p.name?.trim() && phoneVerified(p);

export const visitorOriginLabel = (origin?: string) =>
  origin === "direct"
    ? "直接注册游客"
    : origin === "scan"
      ? "扫码注册游客"
      : origin === "code"
        ? "邀请码注册游客"
        : origin === "admin"
          ? "身份调整游客"
          : "游客 · 待开通";
