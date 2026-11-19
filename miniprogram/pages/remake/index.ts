import { request, error, enterPage, openPage } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import { importHotVideo, REMAKE_SOURCE_KEY } from "../../services/hot-import";
import { breakdownVideo } from "../../services/hot-breakdown";
import { pictureHandlers } from "./pictures";
import type { Picture } from "./pictures";
import type { HotVideo } from "../../services/hot-video";

// Reference videos past this length are refused by most models (Seedance's
// 全能参考 takes about 15 s), so the page says so before starting.
const REFERENCE_SECONDS = 15;

// 一键复刻 (after Clipcat's flow): a hot video (做同款) or a pasted Douyin link,
// optionally the user's own product / person pictures. Starting saves the
// original without watermark into the user's materials, has the video model
// break it down (hook, shots, selling points), then opens the editor's
// 一键复刻 preset with the video and pictures as references; the editor
// writes the remake description from the breakdown.
Page({
  ...pictureHandlers,
  data: {
    video: null as ReturnType<typeof hotView> | null,
    seconds: 0,
    tooLong: false,
    loading: false,
    loadError: "",
    link: "",
    busy: false,
    stage: "",
    pictures: [] as Picture[],
    picturing: false,
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
      const seconds = Math.round(video.duration) || 0;
      this.setData({ video: hotView(video), seconds, tooLong: seconds > REFERENCE_SECONDS });
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
    this.setData({ video: null, seconds: 0, tooLong: false, link: "", loadError: "", loading: false });
  },
  async start() {
    const video = this.data.video;
    if (!video || this.data.busy || this.data.picturing) return;
    this.setData({ busy: true, stage: "正在获取无水印原视频" });
    try {
      const asset = await importHotVideo(video.id, () => !this.destroyed, (stage) => this.setData({ stage }));
      if (!asset || this.destroyed) return;
      this.setData({ stage: "正在拆解原视频的钩子和分镜" });
      // A failed or unavailable breakdown never stops the remake.
      const breakdown = await breakdownVideo(video.id, asset, () => !this.destroyed).catch(() => null);
      if (this.destroyed) return;
      const pictures = this.data.pictures.map((p: Picture) => p.id);
      const refs = pictures.map((_: string, i: number) => "@图片" + (i + 1)).join("、");
      const swap = refs ? `，并把原视频中的商品或人物换成${refs}中的商品或人物` : "";
      // The editor turns these into a shot-by-shot description (feature.ts).
      wx.setStorageSync(REMAKE_SOURCE_KEY, { title: video.title, text: video.text, duration: video.duration, breakdown, images: pictures.length });
      wx.setStorageSync("edit-draft", {
        kind: "video",
        prompt: `参考@视频1的画面内容、镜头运动和节奏，复刻一条同款视频${swap}。视频主题：${video.title}`,
        ratio: "9:16",
        resolution: "",
        duration: Math.round(video.duration) || 5,
        assets: [asset, ...pictures],
      });
      openPage(this, { url: "/pages/create/index?feature=remake" });
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false, stage: "" });
    }
  },
});
