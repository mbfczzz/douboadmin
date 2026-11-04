import {
  request,
  signIn,
  hasSession,
  logout,
  error,
  cancelled,
} from "../../utils/api";
import {
  accessStatus,
  resetAccessNavigation,
  scannedActivation,
} from "../../services/access";
import type { AccessStatus } from "../../services/access";
import type { Config } from "../../services/types";

Page({
  data: {
    logged: false,
    loading: true,
    busy: false,
    code: "",
    loadError: "",
    wechatReady: false,
    status: null as AccessStatus | null,
  },
  revision: 0,
  destroyed: false,
  entering: false,
  onLoad(options: Record<string, string>) {
    if (options.code || options.scene) {
      try {
        this.setData({
          code: scannedActivation(options.code || options.scene),
        });
      } catch (e) {
        error(e);
      }
    }
  },
  onShow() {
    resetAccessNavigation();
    void this.load();
  },
  onUnload() {
    this.destroyed = true;
    this.revision++;
  },
  async load() {
    const revision = ++this.revision;
    this.setData({ logged: hasSession(), loading: true, loadError: "" });
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
  async login() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await signIn();
      if (!this.destroyed) await this.load();
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  async scan() {
    if (this.data.busy || !this.data.logged) return;
    try {
      const result = await wx.scanCode({ scanType: ["qrCode"] });
      if (this.destroyed) return;
      this.setData({ code: scannedActivation(result.result) });
      await this.activate("qr");
    } catch (e) {
      if (!this.destroyed && !cancelled(e)) error(e);
    }
  },
  async direct() {
    if (this.data.busy || !this.data.logged) return;
    this.setData({ busy: true });
    try {
      const status = await request<AccessStatus>("/access/direct", "POST", {});
      if (this.destroyed) return;
      this.setData({ status });
      this.enter();
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  async activate(method?: unknown) {
    if (this.data.busy || !this.data.logged) return;
    this.setData({ busy: true });
    try {
      const status = await request<AccessStatus>("/access/redeem", "POST", {
        code: scannedActivation(this.data.code),
        method: method === "qr" ? "qr" : "code",
      });
      if (this.destroyed) return;
      if (!status.active) throw new Error(status.message || "授权尚未开通");
      this.setData({ status });
      this.enter();
    } catch (e) {
      if (!this.destroyed) error(e);
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
        this.setData({ code: "", status: null });
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
