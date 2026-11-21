import { request, error, enterPage, openPage } from "../../utils/api";
import { mediaHandlers } from "./media";
type Result = { title: string; author: string; text: string };

// 文案提取: a Douyin share link gives the video's caption; a picture, a phone
// video or a chat file is read by a chat model (media.ts). Audio waits for a
// speech-to-text service, so it only says so.
const METHODS = [
  { key: "link", title: "短视频链接", note: "抖音分享链接提取文案", icon: "link", ic: "icLink" },
  { key: "image", title: "图片提取", note: "手机图片转文字", icon: "image", ic: "icPhotoText" },
  { key: "audio", title: "音频提取", note: "音频转文字（即将开放）", icon: "voice", ic: "icAudio" },
  { key: "video", title: "本地视频", note: "手机视频转文字", icon: "video", ic: "icVideo" },
  { key: "file", title: "微信文件提取", note: "聊天里的图片、视频转文字", icon: "file-muted", ic: "icWxfile" },
];

Page({
  ...mediaHandlers,
  // video: the result shown (a link's caption, a picture's or video's text), under resultKey's row.
  data: { methods: METHODS, linkOpen: false, link: "", busy: false, working: "", video: null as Result | null, resultKey: "" },
  revision: 0,
  onShow() {
    enterPage(this);
  },
  onUnload() {
    this.revision++;
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    // 短视频链接 opens and closes its box (the typed link stays); not while reading.
    const key = e.currentTarget.dataset.key as string;
    if (key === "link") {
      if (!this.data.busy) this.setData({ linkOpen: !this.data.linkOpen });
    } else if (key === "image") void this.extractImage();
    else if (key === "video") void this.extractVideo();
    else if (key === "file") void this.extractFile();
    else wx.showToast({ title: "音频转文字即将开放", icon: "none" });
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
    this.setData({ busy: true, working: "link", video: null });
    try {
      const video = await request<Result>("/hot/link", "POST", { text: this.data.link });
      if (revision === this.revision) this.setData({ video, resultKey: "link" });
      void request("/features/extract/use", "POST").catch(() => undefined); // 功能使用
    } catch (e) {
      if (revision === this.revision) error(e);
    } finally {
      if (revision === this.revision) this.setData({ busy: false, working: "" });
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
