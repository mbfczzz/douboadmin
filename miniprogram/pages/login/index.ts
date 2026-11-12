import {
  request,
  media,
  signIn,
  captureLoginFlow,
  hasSession,
  error,
  errorMessage,
  AuthCancelledError,
  enterPage,
  returnAfterTransition,
} from "../../utils/api";
import type { Config } from "../../services/types";
import { loginContext } from "../../services/login-context";
import { canEnter, activationRedirect } from "../../services/access";
import { supportsPhoneLogin, authorizedPhoneCode } from "../../services/phone-login";
Page({
  data: {
    brandIcon: media("/api/brand-icon"),
    ...loginContext(),
    loading: true,
    busy: false,
    wechatReady: false,
    phoneReady: false,
    demoAllowed: false,
    loadError: "",
    returning: false,
    activationRequired: false,
  },
  completed: false,
  destroyed: false,
  autoReturn: false,
  returnTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  flow: undefined as ReturnType<typeof captureLoginFlow> | undefined,
  onShow() {
    enterPage(this);
  },
  onLoad(query: Record<string, string | undefined> = {}) {
    this.setData(loginContext(query.purpose));
    this.flow = captureLoginFlow();
    if (hasSession()) {
      this.autoReturn = true;
      this.setData({ returning: true, loading: false, wechatReady: true });
      return;
    }
    void this.load();
  },
  onReady() {
    if (this.autoReturn) {
      this.returnTimer = setTimeout(() => this.startAutoReturn(), 350);
    }
  },
  onRouteDone() {
    this.startAutoReturn();
  },
  startAutoReturn() {
    if (!this.autoReturn || this.destroyed) return;
    this.autoReturn = false;
    if (this.returnTimer !== undefined) clearTimeout(this.returnTimer);
    void this.finish();
  },
  onUnload() {
    this.destroyed = true;
    if (this.returnTimer !== undefined) clearTimeout(this.returnTimer);
    if (!this.completed) this.flow?.cancel();
  },
  async load() {
    this.setData({ loading: true, loadError: "" });
    try {
      const c = await request<Config>(
        "/config",
        "GET",
        undefined,
        undefined,
        false,
      );
      if (this.destroyed) return;
      this.setData({
        brandIcon: media(c.brandIcon || "/api/brand-icon"),
        wechatReady: c.wechatLogin,
        phoneReady: !!c.wechatPhoneLogin && supportsPhoneLogin(),
        demoAllowed: c.demoLogin,
        activationRequired: !!c.activationRequired,
      });
    } catch (e) {
      if (!this.destroyed) this.setData({ loadError: (e as Error).message });
    } finally {
      if (!this.destroyed) this.setData({ loading: false });
    }
  },
  async wechat() {
    await this.authenticate("wechat");
  },
  async phoneLogin(e: WechatMiniprogram.CustomEvent) {
    if (this.destroyed || this.data.busy) return;
    const code = authorizedPhoneCode(e);
    if (code) await this.authenticate("wechat", code);
  },
  async demo() {
    await this.authenticate("demo");
  },
  async authenticate(mode: "wechat" | "demo", phoneCode?: string) {
    if (this.data.busy) return;
    this.setData({ busy: true, loadError: "" });
    try {
      if (!hasSession() || phoneCode) await signIn(mode, phoneCode);
      if (!this.destroyed) await this.finish();
    } catch (e) {
      if (!this.destroyed && !(e instanceof AuthCancelledError)) {
        const message = errorMessage(e, "微信登录未完成，请重试");
        this.setData({ loadError: message });
        error(e);
      }
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  async finish() {
    if (this.completed) return;
    const flow = this.flow || (this.flow = captureLoginFlow());
    this.completed = true;
    this.setData({ returning: true });
    try {
      if (wx.getStorageSync("activation-required") && !(await canEnter())) {
        flow.cancel();
        activationRedirect();
        return;
      }
      await returnAfterTransition("/pages/mine/index");
      flow.complete();
    } catch {
      this.completed = false;
      flow.cancel();
      if (!this.destroyed) {
        this.setData({ returning: false });
        void this.load();
        error(new Error("登录成功，返回页面失败，请重试"));
      }
    }
  },
  back() {
    if (wx.getStorageSync("activation-required")) {
      activationRedirect();
      return;
    }
    wx.navigateBack({
      fail: () => wx.switchTab({ url: "/pages/templates/index" }),
    });
  },
  privacy() {
    wx.openPrivacyContract({
      fail: () => error(new Error("隐私保护指引暂时无法打开，请稍后重试")),
    });
  },
});
