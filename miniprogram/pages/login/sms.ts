import { sendPhoneCode, signIn, error, AuthCancelledError } from "../../utils/api";

// "使用其他手机号": sign in another phone's account with an SMS code, instead
// of the account this WeChat is already linked to.
type Page = {
  data: { smsPhone: string; smsCode: string; smsChallenge: string; smsWait: number; busy: boolean };
  destroyed: boolean;
  smsTimer: number;
  setData(v: Record<string, unknown>): void;
  finish(): Promise<void>;
};
const validPhone = (p: string) => /^1\d{10}$/.test(p);

function countdown(page: Page, seconds: number) {
  clearInterval(page.smsTimer);
  page.setData({ smsWait: seconds });
  page.smsTimer = setInterval(() => {
    const left = page.data.smsWait - 1;
    if (page.destroyed || left <= 0) clearInterval(page.smsTimer);
    if (!page.destroyed) page.setData({ smsWait: Math.max(0, left) });
  }, 1000) as unknown as number;
}

export const smsState = { smsOpen: false, smsPhone: "", smsCode: "", smsChallenge: "", smsWait: 0, smsCodeFocus: false };

export const smsHandlers = {
  otherPhone(this: Page) {
    this.setData({ smsOpen: true });
  },
  closeSms(this: Page) {
    this.setData({ smsOpen: false });
  },
  smsPhoneInput(this: Page, e: WechatMiniprogram.Input) {
    this.setData({ smsPhone: e.detail.value.trim() });
  },
  smsCodeInput(this: Page, e: WechatMiniprogram.Input) {
    this.setData({ smsCode: e.detail.value.trim() });
  },
  async sendCode(this: Page) {
    const phone = this.data.smsPhone;
    if (this.data.smsWait > 0 || this.data.busy) return;
    if (!validPhone(phone)) return error(new Error("请输入正确的手机号"));
    this.setData({ busy: true });
    try {
      const r = await sendPhoneCode(phone);
      if (this.destroyed) return;
      this.setData({ smsChallenge: r.challenge, smsCode: "", smsCodeFocus: true });
      countdown(this, r.resendIn || 60);
      wx.showToast({ title: "验证码已发送", icon: "none" });
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  async smsLogin(this: Page) {
    const { smsPhone: phone, smsCode: code, smsChallenge: challenge } = this.data;
    if (this.data.busy) return;
    if (!validPhone(phone)) return error(new Error("请输入正确的手机号"));
    if (!challenge) return error(new Error("请先获取验证码"));
    if (!/^\d{6}$/.test(code)) return error(new Error("请输入 6 位验证码"));
    this.setData({ busy: true });
    try {
      await signIn("phone", undefined, { phone, code, challenge });
      clearInterval(this.smsTimer);
      if (!this.destroyed) await this.finish();
    } catch (e) {
      if (!this.destroyed && !(e instanceof AuthCancelledError)) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
};
