import { request, error, enterPage, openPage } from "../../utils/api";
import type { HotVideo } from "../../services/hot-video";

// 文案提取: a Douyin share link gives the video's caption. The other ways
// (pictures, audio, local video, chat files) need speech/OCR models that are
// not connected yet, so they only say so.
const METHODS = [
  { key: "link", title: "短视频链接", note: "抖音分享链接提取文案", icon: "link", ic: "icLink" },
  { key: "image", title: "图片提取", note: "手机图片转文字", icon: "image", ic: "icPhotoText" },
  { key: "audio", title: "音频提取", note: "音频转文字", icon: "voice", ic: "icAudio" },
  { key: "video", title: "本地视频", note: "手机视频转文字", icon: "video", ic: "icVideo" },
  { key: "file", title: "微信文件提取", note: "聊天里的音频、文档转文字", icon: "file-muted", ic: "icWxfile" },
];

Page({
  data: { methods: METHODS, linkOpen: false, link: "", busy: false, video: null as HotVideo | null },
  revision: 0,
  onShow() {
    enterPage(this);
  },
  onUnload() {
    this.revision++;
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    // 短视频链接 opens and closes its box (the typed link stays); not while reading.
    if (e.currentTarget.dataset.key === "link") {
      if (!this.data.busy) this.setData({ linkOpen: !this.data.linkOpen });
    }
    else wx.showToast({ title: "该提取方式即将开放", icon: "none" });
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ link: e.detail.value });
  },
  paste() {
    wx.getClipboardData({ success: (r) => this.setData({ link: r.data.slice(0, 500) }) });
  },
  async extract() {
    if (this.data.busy) return;
    if (!this.data.link.trim()) return error(new Error("请粘贴抖音视频的分享链接"));
    const revision = ++this.revision;
    this.setData({ busy: true });
    try {
      const video = await request<HotVideo>("/hot/link", "POST", { text: this.data.link });
      if (revision === this.revision) this.setData({ video });
      void request("/features/extract/use", "POST").catch(() => undefined); // 功能使用
    } catch (e) {
      if (revision === this.revision) error(e);
    } finally {
      if (revision === this.revision) this.setData({ busy: false });
    }
  },
  copy() {
    if (this.data.video) wx.setClipboardData({ data: this.data.video.text || this.data.video.title });
  },
  // The caption becomes the prompt of a new video.
  create() {
    const text = (this.data.video?.text || this.data.video?.title || "").slice(0, 500);
    wx.setStorageSync("edit-draft", { kind: "video", prompt: text, ratio: "9:16", resolution: "", duration: 5, assets: [] });
    openPage(this, { url: "/pages/create/index" });
  },
});
