import { error } from "../utils/api";

export type ConsentPage = {
  data: { legalAgreed: boolean };
  setData(value: Record<string, unknown>): void;
};

export const legalConsentState = { legalAgreed: false };

export function legalConsent(
  this: ConsentPage,
  event: WechatMiniprogram.CustomEvent<{ checked: boolean }>,
) {
  this.setData({ legalAgreed: event.detail.checked === true });
}

export function needConsent() {
  wx.showToast({ title: "请先阅读并同意用户服务协议和隐私政策", icon: "none" });
}

export function requireLegalConsent(page: ConsentPage) {
  if (page.data.legalAgreed) return true;
  needConsent();
  return false;
}

export function openPrivacy() {
  wx.openPrivacyContract({
    fail: () => error(new Error("隐私保护指引暂时无法打开，请稍后重试")),
  });
}
