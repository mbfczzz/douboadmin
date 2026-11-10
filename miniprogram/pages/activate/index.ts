import {
  request,
  signIn,
  hasSession,
  logout,
  error,
  errorMessage,
  AuthCancelledError,
  cancelled,
  RequestError,
} from "../../utils/api";
import {
  accessStatus,
  resetAccessNavigation,
  shareFrom,
} from "../../services/access";
import type { AccessStatus } from "../../services/access";
import { trackVisit } from "../../services/analytics";
import type { Config } from "../../services/types";
import {
  registerState,
  prefill,
  sendCode,
  register,
  stopCountdown,
} from "./register";

Page({
  data: {
    logged: false,
    loading: true,
    busy: false,
    code: "",
    loadError: "",
    wechatReady: false,
    status: null as AccessStatus | null,
    ...registerState,
  },
  revision: 0,
  destroyed: false,
  entering: false,
  timer: undefined as number | undefined,
  onShow() {
    trackVisit(this);
    resetAccessNavigation();
    void this.load();
  },
  onUnload() {
    this.destroyed = true;
    this.revision++;
    stopCountdown(this);
  },
  async load() {
    const revision = ++this.revision;
    this.setData({
      logged: hasSession(),
      loading: true,
      loadError: "",
    });
    try {
      if (!hasSession()) {
        const c = await request<Config>(
          "/config",
          "GET",
          undefined,
          undefined,
          false,
        );
        if (revision === this.revision)
          this.setData({ wechatReady: c.wechatLogin, status: null });
        return;
      }
      const status = await accessStatus();
      if (revision !== this.revision) return;
      if (status.status === "login" && !hasSession()) {
        await this.load();
        return;
      }
      this.setData({ status, logged: hasSession() });
      prefill(this, status);
      if (status.active) this.enter();
    } catch (e) {
      if (revision === this.revision)
        this.setData({ loadError: (e as Error).message });
    } finally {
      if (revision === this.revision) this.setData({ loading: false });
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ code: e.detail.value });
  },
  field(e: WechatMiniprogram.Input) {
    const key = e.currentTarget.dataset.field as string;
    if (["name", "phone", "smsCode"].includes(key))
      this.setData({ [key]: e.detail.value });
  },
  async sendCode() {
    if (!this.data.busy && this.data.logged) await sendCode(this);
  },
  async register() {
    if (this.data.busy || !this.data.logged) return;
    const status = await register(this);
    if (status?.active) this.enter();
  },
  async login() {
    if (this.data.busy) return;
    this.setData({ busy: true, loadError: "" });
    try {
      await signIn();
      if (!this.destroyed) await this.load();
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
  async scan() {
    if (this.data.busy || !this.data.logged) return;
    try {
      const result = await wx.scanCode({ scanType: ["qrCode"] });
      if (this.destroyed) return;
      await this.join(shareFrom(result.result), "scan");
    } catch (e) {
      if (!this.destroyed && !cancelled(e)) error(e);
    }
  },
  confirm() {
    try {
      void this.join(shareFrom(this.data.code), "code");
    } catch (e) {
      error(e);
    }
  },
  async join(code: string, method: "scan" | "code") {
    if (this.data.busy || !this.data.logged) return;
    this.setData({ busy: true, code });
    try {
      const status = await request<AccessStatus>("/access/join", "POST", {
        code,
        method,
      });
      if (this.destroyed) return;
      // Scanning only registers; the platform opens the account later.
      this.setData({ status, code: "" });
      if (status.active) this.enter();
      else wx.showToast({ title: "已登记，等待总部开通", icon: "none" });
    } catch (e) {
      if (!this.destroyed) {
        if (e instanceof RequestError && e.status === 403) await this.load();
        if (!this.destroyed) error(e);
      }
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  enter() {
    if (this.entering || this.destroyed) return;
    this.entering = true;
    wx.reLaunch({
      url: "/pages/templates/index",
      fail: () => {
        this.entering = false;
        if (!this.destroyed)
          this.setData({ loadError: "进入失败，请点击重试" });
      },
    });
  },
  async signOut() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await logout();
      if (!this.destroyed) {
        stopCountdown(this);
        this.setData({ code: "", status: null, ...registerState });
        await this.load();
      }
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  privacy() {
    wx.openPrivacyContract({
      fail: () => error(new Error("隐私保护指引暂时无法打开")),
    });
  },
});
