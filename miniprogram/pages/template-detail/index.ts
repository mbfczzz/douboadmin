import {
  request,
  error,
  media,
  chooseMediaFile,
  cancelled,
  submitInput,
  openTask,
  hasSession,
  login,
  AuthCancelledError,
  enterPage,
  openPage,
  isNavigating,
} from "../../utils/api";
import type { Template, Row, Asset } from "../../services/types";
import { loadQuote } from "./quote";
Page({
  data: {
    template: null as Row<Template> | null,
    quoteText: "",
    loading: true,
    loadError: "",
    assets: [] as Row<Asset>[],
    optionalNames: ["场景照片", "品牌标识", "商品特写", "宣传文案图"],
    fixedCount: false,
    busy: false,
    uploading: false,
    favorite: false,
    favoriteVersion: 0,
    favoriteBusy: false,
    sourceOpen: false,
    sources: [
      { label: "从相册选择", icon: "image" },
      { label: "拍摄照片", icon: "camera" },
      { label: "选择文件", icon: "folder-open" },
    ],
  },
  id: "",
  favoriteRevision: 0,
  visible: true,
  destroyed: false,
  onHide() {
    this.visible = false;
  },
  onUnload() {
    this.destroyed = true;
    this.quoteAbort?.();
    this.visible = false;
    this.favoriteRevision++;
  },
  onLoad(o: Record<string, string>) {
    this.id = o.id;
  },
  onShow() {
    this.visible = true;
    enterPage(this);
    void this.load();
  },
  async load() {
    this.setData({ loadError: "" });
    try {
      const t = await request<Row<Template>>(
        "/templates/" + this.id,
        "GET",
        undefined,
        undefined,
        false,
      );
      if (t.data.kind !== "video") {
        this.setData({ template: null, quoteText: "" });
        throw new Error("模板已下架");
      }
      t.data.cover = media(t.data.cover);
      if (this.destroyed) return;
      // Image-to-video and keyframe take an exact photo count; extra
      // photos would only be rejected at submit.
      this.setData({
        template: t,
        fixedCount: ["i2v", "keyframe"].includes(t.data.mode),
      });
      loadQuote(this, t);
      if (!hasSession()) {
        this.setData({ favorite: false, favoriteVersion: 0 });
        return;
      }
      if (!this.data.favoriteBusy) void this.refreshFavorite();
    } catch (e) {
      this.setData({ loadError: (e as Error).message });
    } finally {
      if (!this.destroyed) this.setData({ loading: false });
    }
  },
  async refreshFavorite() {
    const revision = this.favoriteRevision;
    try {
      const f = await request<Row<{ active: boolean }>>("/favorites/" + this.id);
      if (revision === this.favoriteRevision)
        this.setData({
          favorite: !!f?.data.active,
          favoriteVersion: f?.version || 0,
        });
    } catch (e) {
      if (!hasSession()) this.setData({ favorite: false, favoriteVersion: 0 });
      else error(e);
    }
  },
  choose() {
    if (!this.data.uploading) this.setData({ sourceOpen: true });
  },
  closeSource() {
    this.setData({ sourceOpen: false });
  },
  async chooseSource(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading) return;
    this.setData({ sourceOpen: false });
    try {
      const f = await chooseMediaFile(
        true,
        Number(e.currentTarget.dataset.index),
      );
      openPage(this, {
        url: "/pages/upload-preview/index",
        events: {
          confirmed: (a: Row<Asset>) => {
            this.setData({ assets: [...this.data.assets, a] });
          },
        },
        success: (r) => r.eventChannel.emit("file", f),
      });
    } catch (e) {
      if (!cancelled(e)) error(e);
    }
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    this.setData({
      assets: this.data.assets.filter(
        (a: Row<Asset>) => a.id !== e.currentTarget.dataset.id,
      ),
    });
  },
  async favorite() {
    if (this.data.favoriteBusy) return;
    const desired = !this.data.favorite;
    this.favoriteRevision++;
    this.setData({ favoriteBusy: true });
    try {
      await login("favorite");
      const current = await request<Row<{ active: boolean }>>("/favorites/" + this.id);
      if (!!current?.data.active === desired) {
        this.setData({
          favorite: desired,
          favoriteVersion: current?.version || 0,
        });
        return;
      }
      const row = await request<Row>("/favorites/" + this.id, "PUT", {
        active: desired,
        version: current?.version || 0,
      });
      this.setData({
        favorite: desired,
        favoriteVersion: row.version,
      });
    } catch (e) {
      error(e);
      if (!(e instanceof AuthCancelledError) && hasSession())
        void this.refreshFavorite();
    } finally {
      this.setData({ favoriteBusy: false });
    }
  },
  preview() {
    if (this.data.template)
      wx.previewImage({ urls: [this.data.template.data.cover] });
  },
  async generate() {
    if (this.data.busy || !this.data.template || isNavigating(this)) return;
    const t = this.data.template;
    if (t.data.kind !== "video") return error(new Error("模板仅支持视频"));
    this.setData({ busy: true });
    try {
      const j = await submitInput(
        {
          kind: "video",
          templateId: t.id,
          prompt: t.data.prompt,
          model: t.data.model,
          quality: t.data.quality,
          mode: t.data.requiredImages ? t.data.mode : "",
          resolution: t.data.resolution,
          ratio: t.data.ratio,
          duration: t.data.duration || 0,
          assets: this.data.assets.map((a: Row<Asset>) => a.id),
        },
        "template-" + t.id,
      );
      if (this.visible) openTask(j.id, this);
      else wx.showToast({ title: "任务已加入队列", icon: "success" });
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
});
