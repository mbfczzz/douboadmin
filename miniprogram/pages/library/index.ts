import {
  request,
  error,
  logout,
  media,
  jobView,
  openTask,
  enterPage,
  openPage,
  hasSession,
  login,
} from "../../utils/api";
import type { Template, Row, Job } from "../../services/types";
Page({
  data: {
    mode: "favorites",
    title: "我的收藏",
    templates: [] as Row<Template>[],
    unavailableFavorites: [] as Row<{ templateId: string; active: boolean }>[],
    removingFavorite: "",
    notifications: [] as ReturnType<typeof jobView>[],
    loading: true,
    loadError: "",
    needsLogin: false,
    signingIn: false,
    content: "",
    canSend: false,
    busy: false,
  },
  loadVersion: 0,
  destroyed: false,
  onUnload() {
    this.loadVersion++;
    this.destroyed = true;
  },
  onLoad(o: Record<string, string>) {
    const names: Record<string, string> = {
      favorites: "我的收藏",
      notifications: "消息通知",
      help: "帮助与反馈",
      settings: "设置",
    };
    const mode = names[o.mode] ? o.mode : "help";
    this.setData({ mode, title: names[mode] });
  },
  onShow() {
    enterPage(this);
    void this.load();
  },
  async load() {
    const version = ++this.loadVersion;
    if (
      ["favorites", "notifications"].includes(this.data.mode) &&
      !hasSession()
    ) {
      this.setData({
        needsLogin: true,
        loading: false,
        loadError: "",
        templates: [],
        unavailableFavorites: [],
        notifications: [],
      });
      return;
    }
    this.setData({ loadError: "", needsLogin: false });
    try {
      if (this.data.mode === "favorites") {
        const [fav, all] = await Promise.all([
          request<Row<{ templateId: string; active: boolean }>[]>("/favorites"),
          request<Row<Template>[]>("/templates"),
        ]);
        if (version !== this.loadVersion) return;
        const ids = fav
          .filter((f) => f.data.active)
          .map((f) => f.data.templateId);
        this.setData({
          templates: all
            .filter((t) => ids.includes(t.id))
            .map((t) => ({
              ...t,
              data: { ...t.data, cover: media(t.data.cover) },
            })),
          unavailableFavorites: fav.filter(
            (f) =>
              f.data.active && !all.some((t) => t.id === f.data.templateId),
          ),
        });
      }
      if (this.data.mode === "notifications") {
        const jobs = await request<Job[]>("/jobs");
        if (version !== this.loadVersion) return;
        this.setData({
          notifications: jobs
            .filter(
              (j) =>
                j.input.kind !== "chat" &&
                (j.status === "succeeded" || j.status === "failed"),
            )
            .map(jobView),
        });
      }
    } catch (e) {
      if (version !== this.loadVersion) return;
      if (!hasSession())
        this.setData({
          needsLogin: true,
          templates: [],
          unavailableFavorites: [],
          notifications: [],
        });
      else this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.loadVersion) this.setData({ loading: false });
    }
  },
  async signIn() {
    if (this.data.signingIn) return;
    this.setData({ signingIn: true });
    try {
      await login(this.data.mode === "favorites" ? "favorite" : "tasks");
      await this.load();
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ signingIn: false });
    }
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    openPage(this, {
      url: "/pages/template-detail/index?id=" + e.currentTarget.dataset.id,
    });
  },
  async removeFavorite(e: WechatMiniprogram.TouchEvent) {
    if (this.data.removingFavorite) return;
    const item = this.data.unavailableFavorites.find(
      (row: Row) => row.id === e.currentTarget.dataset.id,
    );
    if (!item) return;
    this.setData({ removingFavorite: item.id });
    try {
      await request("/favorites/" + item.data.templateId, "PUT", {
        active: false,
        version: item.version,
      });
      await this.load();
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ removingFavorite: "" });
    }
  },
  task(e: WechatMiniprogram.TouchEvent) {
    openTask(e.currentTarget.dataset.id, this);
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({
      content: e.detail.value,
      canSend: e.detail.value.trim().length >= 3,
    });
  },
  async send() {
    if (this.data.busy) return;
    const draft = this.data.content;
    const content = draft.trim();
    if (content.length < 3) {
      error(new Error("请至少填写 3 个字的反馈"));
      return;
    }
    this.setData({ busy: true });
    try {
      await request("/feedback", "POST", { content });
      if (this.destroyed) return;
      if (this.data.content === draft)
        this.setData({ content: "", canSend: false });
      wx.showToast({ title: "反馈已提交", icon: "success" });
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后，下次使用需要重新登录。",
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await logout();
          wx.showToast({ title: "已退出", icon: "success" });
          wx.reLaunch({
            url: "/pages/templates/index",
            fail: () => error(new Error("已退出登录，请重新打开小程序")),
          });
        } catch (e) {
          error(e);
        }
      },
    });
  },
  privacy() {
    wx.showModal({
      title: "服务使用说明",
      content:
        "创作内容通过服务端提交给模型处理，作品和任务记录保存在服务端。豆播积分支付与扣费尚未启用。",
      showCancel: false,
    });
  },
});
