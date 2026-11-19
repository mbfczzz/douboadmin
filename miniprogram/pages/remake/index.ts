import { request, error, enterPage, openPage } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import { importHotVideo } from "../../services/hot-import";
import type { HotVideo } from "../../services/hot-video";

// 一键复刻: a hot video (做同款) or a pasted Douyin link. Starting saves the
// original upload without watermark into the user's materials, then opens
// the editor's 一键复刻 preset with it as the reference video.
Page({
  data: {
    video: null as ReturnType<typeof hotView> | null,
    loading: false,
    loadError: "",
    link: "",
    busy: false,
    stage: "",
  },
  id: "",
  revision: 0,
  visible: true,
  destroyed: false,
  onLoad(query: Record<string, string>) {
    this.id = query.id || "";
  },
  onShow() {
    this.visible = true;
    enterPage(this);
    if (this.id && !this.data.video) void this.load();
  },
  onHide() {
    this.visible = false;
  },
  onUnload() {
    this.destroyed = true;
    this.revision++;
  },
  // From 做同款 (by ID) or the link box (by share text).
  async load() {
    const version = ++this.revision;
    this.setData({ loading: true, loadError: "" });
    try {
      const video = this.id
        ? await request<HotVideo>("/hot/videos/" + this.id)
        : await request<HotVideo>("/hot/link", "POST", { text: this.data.link });
      if (version !== this.revision) return;
      this.id = video.id;
      this.setData({ video: hotView(video) });
    } catch (e) {
      if (version === this.revision) this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ link: e.detail.value });
  },
  paste() {
    wx.getClipboardData({ success: (r) => this.setData({ link: r.data.slice(0, 500) }) });
  },
  readLink() {
    if (this.data.loading) return;
    if (!this.data.link.trim()) return error(new Error("请粘贴抖音视频的分享链接"));
    this.id = "";
    void this.load();
  },
  change() {
    this.id = "";
    this.revision++;
    this.setData({ video: null, link: "", loadError: "", loading: false });
  },
  async start() {
    const video = this.data.video;
    if (!video || this.data.busy) return;
    this.setData({ busy: true, stage: "正在获取无水印原视频" });
    try {
      const asset = await importHotVideo(video.id, () => !this.destroyed, (stage) => this.setData({ stage }));
      if (!asset || this.destroyed) return;
      wx.setStorageSync("edit-draft", {
        kind: "video",
        prompt: `参考@视频1的画面内容、镜头运动和节奏，复刻一条同款视频。视频主题：${video.title}`,
        ratio: "9:16",
        resolution: "",
        duration: Math.round(video.duration) || 5,
        assets: [asset],
      });
      openPage(this, { url: "/pages/create/index?feature=remake" });
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false, stage: "" });
    }
  },
});
