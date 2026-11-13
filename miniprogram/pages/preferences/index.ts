import { loadConfig } from "../../utils/config-cache";
import { debugEnabled, setDebug } from "../../services/trial-debug";
import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  logout,
  openPage,
} from "../../utils/api";
import type { Row, Config } from "../../services/types";
import type { Preferences } from "../../services/business";
Page({
  data: {
    row: null as Row<Preferences> | null,
    needsLogin: false,
    loadError: "",
    busy: false,
    completionTemplateId: "",
    version: "",
  },
  revision: 0,
  actionRevision: 0,
  destroyed: false,
  signingOut: false,
  onLoad() {
    // The released version, or the environment while in development/trial.
    const info = wx.getAccountInfoSync?.().miniProgram;
    const env: Record<string, string> = { develop: "开发版", trial: "体验版" };
    this.setData({ version: info?.version ? "v" + info.version : env[info?.envVersion || ""] || "" });
  },
  // Five quick taps on 当前版本 switch the debug console (vConsole) on or off.
  versionTaps: 0,
  versionTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  version() {
    if (this.versionTimer !== undefined) clearTimeout(this.versionTimer);
    this.versionTimer = setTimeout(() => (this.versionTaps = 0), 1500);
    if (++this.versionTaps < 5) return;
    this.versionTaps = 0;
    const on = !debugEnabled();
    setDebug(on);
    wx.showToast({ title: on ? "调试面板已打开，重启后生效" : "调试面板已关闭", icon: "none" });
  },
  privacy() {
    wx.openPrivacyContract({ fail: () => error(new Error("隐私保护指引暂时无法打开")) });
  },
  help() {
    openPage(this, { url: "/pages/library/index?mode=help" });
  },
  onShow() {
    enterPage(this);
    void this.load();
  },
  onUnload() {
    this.revision++;
    this.actionRevision++;
    this.destroyed = true;
  },
  async signIn() {
    try {
      await login();
      await this.load();
    } catch (e) {
      error(e);
    }
  },
  async load() {
    if (this.destroyed || this.signingOut) return;
    const revision = ++this.revision;
    if (!hasSession()) {
      this.setData({ needsLogin: true, row: null });
      return;
    }
    try {
      const [row, c] = await Promise.all([
        request<Row<Preferences>>("/preferences"),
        loadConfig(),
      ]);
      if (revision !== this.revision) return;
      wx.setStorageSync("analytics-consent", row.data.analytics);
      wx.setStorageSync("autoplay-preference", row.data.autoplay);
      this.setData({
        row,
        needsLogin: false,
        loadError: "",
        completionTemplateId: c.completionTemplateId || "",
      });
    } catch (e) {
      if (revision === this.revision) {
        if (!hasSession())
          this.setData({
            needsLogin: true,
            row: null,
            completionTemplateId: "",
            loadError: "",
          });
        else this.setData({ loadError: (e as Error).message });
      }
    }
  },
  async change(e: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    if (!this.data.row || this.data.busy) return;
    const revision = this.actionRevision;
    const key = e.currentTarget.dataset.field as keyof Preferences;
    this.setData({ busy: true });
    try {
      const data = { ...this.data.row.data, [key]: e.detail.value };
      const row = await request<Row<Preferences>>("/preferences", "PUT", {
        version: this.data.row.version,
        data,
      });
      if (revision !== this.actionRevision) return;
      this.setData({ row });
      wx.setStorageSync("analytics-consent", row.data.analytics);
      wx.setStorageSync("autoplay-preference", row.data.autoplay);
    } catch (e) {
      if (revision !== this.actionRevision) return;
      error(e);
      await this.load();
    } finally {
      if (revision === this.actionRevision) this.setData({ busy: false });
    }
  },
  async subscribe() {
    if (!this.data.completionTemplateId || !this.data.row || this.data.busy)
      return;
    const revision = this.actionRevision;
    this.setData({ busy: true });
    try {
      const id = this.data.completionTemplateId;
      const result = await wx.requestSubscribeMessage({ tmplIds: [id] });
      if (revision !== this.actionRevision) return;
      const data = {
        ...this.data.row.data,
        completionSubscription: result[id] === "accept",
      };
      const row = await request<Row<Preferences>>("/preferences", "PUT", {
        version: this.data.row.version,
        data,
      });
      if (revision === this.actionRevision) this.setData({ row });
    } catch (e) {
      if (revision === this.actionRevision) error(e);
    } finally {
      if (revision === this.actionRevision) this.setData({ busy: false });
    }
  },
  async signOut() {
    if (this.signingOut) return;
    this.signingOut = true;
    this.setData({ busy: true });
    this.actionRevision++;
    this.revision++;
    try {
      await logout();
      wx.removeStorageSync("analytics-consent");
      wx.removeStorageSync("autoplay-preference");
      wx.reLaunch({ url: "/pages/templates/index" });
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      this.signingOut = false;
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
});
