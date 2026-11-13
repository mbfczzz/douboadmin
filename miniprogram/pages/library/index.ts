import { readView, writeView, rememberRows, VIEW_MAX_AGE, noteIssued } from "../../utils/view-cache";
import { unfavorite } from "./unfavorite";
import { pullRefresh } from "../../utils/refresh";
import { movePage } from "../../services/list-page";
import {
  request,
  error,
  media,
  jobView,
  openTask,
  enterPage,
  openPage,
  openTab,
  hasSession,
  login,
} from "../../utils/api";
import type { Template, Row } from "../../services/types";
import { jobPage } from "../../services/job-pages";
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
    faqOpen: 0, // the first answer starts open; tapping a question toggles it
    faqs: [
      { q: "生成需要多久？", a: "图片、视频与创作助手通过服务端连接真实模型。生成耗时取决于模型和排队情况。" },
      { q: "生成失败怎么办？", a: "可以在任务详情重试，或重新编辑提示词后提交。失败的积分会自动退回。" },
      { q: "如何保存作品？", a: "打开已完成的任务，点击保存，并允许访问相册。" },
    ],
    busy: false,
    page: 1,
    total: 0,
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
    };
    const mode = names[o.mode] ? o.mode : "help";
    this.setData({ mode, title: names[mode] });
  },
  onShow() {
    enterPage(this);
    // First open of 我的收藏: last favorites show at once while they refresh.
    if (this.data.mode === "favorites" && this.data.loading && hasSession()) {
      const seen = readView<{ templates: Row<Template>[]; total: number }>("favorites", VIEW_MAX_AGE);
      if (seen?.templates) {
        rememberRows(seen.templates);
        this.setData({ templates: seen.templates, total: seen.total, loading: false });
      }
    }
    void this.load();
  },
  onPullDownRefresh() {
    void pullRefresh(() => this.load());
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
        const result = await request<{
          items: Row<Template>[];
          total: number;
          unavailable?: Row<{ templateId: string; active: boolean }>[];
        }>(`/favorites/templates?page=${this.data.page}&size=20`);
        if (version !== this.loadVersion) return;
        const templates = result.items.map((t) => ({
          ...t,
          data: { ...t.data, cover: media(t.data.cover) },
        }));
        rememberRows(templates);
        noteIssued(...templates.map((t) => t.data.cover));
        if (this.data.page === 1) writeView("favorites", { templates, total: result.total });
        this.setData({
          total: result.total,
          templates,
          unavailableFavorites: result.unavailable || [],
        });
      }
      if (this.data.mode === "notifications") {
        const result = await jobPage(
          this.data.page,
          "&excludeChat=true&ended=true",
        );
        const jobs = result.items;
        if (version !== this.loadVersion) return;
        this.setData({
          total: result.total,
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
  browse() {
    openTab(this, "/pages/templates/index");
  },
  previous() {
    movePage(this, -1);
  },
  next() {
    movePage(this, 1);
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
  unfavorite(e: WechatMiniprogram.TouchEvent) {
    return unfavorite(this, e.currentTarget.dataset.id);
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
  faq(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ faqOpen: this.data.faqOpen === index ? -1 : index });
  },
});
