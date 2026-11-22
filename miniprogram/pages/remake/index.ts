import { request, error, enterPage, replacePage } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import { startRemake, startUploadRemake } from "../../services/hot-import";
import { uploadHandlers } from "./upload";
import { longestReference } from "../../services/reference-clip";
import { pickHandlers } from "./picks";
import type { HotVideo } from "../../services/hot-video";

// An original longer than any model takes as a reference (Seedance 2.5:
// 30 s) cannot be remade: the page says so and does not start.

// 一键复刻 (after Clipcat's flow): a hot video (做同款) or a pasted Douyin link,
// Starting adds a task
// to the queue (services/hot-import.ts) that saves the original without
// watermark and breaks it down; its task page then opens the editor.
Page({
  ...uploadHandlers,
  ...pickHandlers,
  data: {
    video: null as ReturnType<typeof hotView> | null,
    seconds: 0,
    tooLong: false,
    limit: 0, // the longest reference any model takes, when tooLong
    loading: false,
    loadError: "",
    link: "",
    busy: false,
    uploadingVideo: false,
    uploadPercent: -1, // upload progress of a video from the phone (upload.ts)
    pickWords: [] as string[], // remake ideas while nothing is chosen (picks.ts)
    pickWord: "",
    picks: [] as ReturnType<typeof hotView>[],
    picksLoading: false,
  },
  id: "",
  uploadId: "",
  pickRevision: 0,
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
    void this.loadPicks();
  },
  onHide() {
    this.visible = false;
  },
  onUnload() {
    this.destroyed = true;
    this.revision++;
  },
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
      const limit = await longestReference().catch(() => 0);
      if (version !== this.revision) return;
      const tooLong = !!limit && seconds > limit;
      this.setData({ video: hotView(video), seconds, tooLong, limit });
      if (!tooLong) void this.start(); // no confirmation step: straight to the breakdown
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
    this.uploadId = "";
    this.revision++;
    this.setData({ video: null, seconds: 0, tooLong: false, link: "", loadError: "", loading: false });
  },
  async start() {
    const video = this.data.video;
    if (!video || this.data.busy || this.data.tooLong) return;
    this.setData({ busy: true });
    try {
      const pictures: string[] = []; // chosen per subject on the task page (task-detail/swap.ts)
      const job = this.uploadId
        ? await startUploadRemake(this.uploadId, { title: video.title, duration: this.data.seconds }, pictures)
        : await startRemake(video.id, { title: video.title, text: video.text, duration: video.duration }, pictures);
      // The task page replaces this one, so Back does not return here.
      if (!this.destroyed) replacePage(this, "/pages/task-detail/index?id=" + job.id);
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
});
