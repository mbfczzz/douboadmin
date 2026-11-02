import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  logout,
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
  },
  revision: 0,
  actionRevision: 0,
  destroyed: false,
  signingOut: false,
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
        request<Config>("/config", "GET", undefined, undefined, false),
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
