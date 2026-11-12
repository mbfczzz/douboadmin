import { error } from "../utils/ui";

export function supportsPhoneLogin() {
  return !!wx.canIUse?.("button.open-type.getPhoneNumber");
}

export function authorizedPhoneCode(e: WechatMiniprogram.CustomEvent) {
  const { code, errMsg = "" } = e.detail || {};
  if (typeof code === "string" && code) return code;
  if (!/deny|cancel/i.test(errMsg)) error(new Error("微信手机号授权未完成，可使用其他手机号登录"));
  return "";
}
