import { request, error, enterPage, openTask } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import { startRemake } from "../../services/hot-import";
import { pictureHandlers } from "./pictures";
import type { Picture } from "./pictures";
import type { HotVideo } from "../../services/hot-video";

// Reference videos past this length are refused by most models (Seedance's
// 全能参考 takes about 15 s), so the page says so before starting.
const REFERENCE_SECONDS = 15;

// 一键复刻 (after Clipcat's flow): a hot video (做同款) or a pasted Douyin link,
// optionally the user's own product / person pictures. Starting adds a task
// to the queue (services/hot-import.ts) that saves the original without
// watermark and breaks it down; its task page then opens the editor.
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
    this.setData({ busy: true });
    try {
      const pictures = this.data.pictures.map((p: Picture) => p.id);
      const job = await startRemake(video.id, { title: video.title, text: video.text, duration: video.duration }, pictures);
      if (!this.destroyed) openTask(job.id, this);
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
});
