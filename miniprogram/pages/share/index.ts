import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  media,
} from "../../utils/api";
import type { Job } from "../../services/types";
import { track } from "../../services/analytics";
import { resultImages } from "../../services/result-images";
import { recallRow, freshUrl, noteIssued } from "../../utils/view-cache";
interface Share {
  token: string;
  path: string;
  url: string;
  publicDomainConfigured: boolean;
  expiresAt: string;
}
Page({
  data: {
    job: null as Job | null,
    share: null as Share | null,
    title: "豆播创作作品",
    showPrompt: false,
    busy: false,
    loadError: "",
    needsLogin: false,
  },
  id: "",
  revision: 0,
  loaded: false,
  shareRevision: 0,
  destroyed: false,
  onLoad(o: Record<string, string>) {
    this.id = o.id;
    // Opened from task detail: paint the known work at once.
    const known = recallRow<Job>(o.id);
    if (known?.status === "succeeded") this.setData({ job: known });
  },
  // Back from the share sheet or a preview: keep the work (no video reload).
  onShow() {
    enterPage(this);
    if (!this.loaded || this.data.loadError) void this.load(); // a load cut short by leaving retries
  },
  onUnload() {
    this.revision++;
    this.shareRevision++;
    this.destroyed = true;
  },
  onHide() { this.revision++; },
  async signIn() {
    try {
      await login();
      await this.load();
    } catch (e) {
      error(e);
    }
  },
  async load() {
    const revision = ++this.revision;
    if (!hasSession()) {
      this.shareRevision++;
      this.setData({ needsLogin: true, job: null, share: null });
      return;
    }
    try {
      const job = await request<Job>("/jobs/" + this.id);
      if (revision !== this.revision) return;
      if (job.result) job.result = media(job.result);
      if (job.input.kind === "image") job.results = resultImages(job);
      noteIssued(job.result, ...(job.results || []));
      if (job.deleted) {
        this.shareRevision++;
        this.setData({ share: null });
      }
      this.loaded = true;
      this.setData({ job, needsLogin: false, loadError: "" });
    } catch (e) {
      if (revision === this.revision) {
        this.shareRevision++;
        this.setData({ share: null });
        if (!hasSession()) this.setData({ job: null, needsLogin: true });
        this.setData({ loadError: (e as Error).message });
      }
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.shareRevision++;
    this.setData({ title: e.detail.value, share: null });
  },
  async preview(e: WechatMiniprogram.CustomEvent<{ index: number }>) {
    const shown = this.data.job ? resultImages(this.data.job) : [];
    if (shown[e.detail.index] && freshUrl(shown[e.detail.index]))
      return wx.previewImage({ urls: shown, current: shown[e.detail.index] });
    const revision = this.revision + 1;
    await this.load();
    if (this.destroyed || this.revision !== revision || this.data.loadError) return;
    if (!this.data.job || this.data.job.deleted || this.data.needsLogin) return;
    const urls = resultImages(this.data.job);
    if (urls[e.detail.index]) wx.previewImage({ urls, current: urls[e.detail.index] });
  },
  prompt(e: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    this.shareRevision++;
    this.setData({ showPrompt: e.detail.value, share: null });
  },
  async prepare() {
    if (
      this.data.busy ||
      this.destroyed ||
      !this.data.job ||
      this.data.job.deleted
    )
      return;
    const revision = ++this.shareRevision;
    this.setData({ busy: true });
    try {
      const share = await request<Share>("/shares", "POST", {
        jobId: this.id,
        title: this.data.title,
        showPrompt: this.data.showPrompt,
      });
      if (revision !== this.shareRevision) return;
      this.setData({ share });
      track("share_created", "share", this.id);
    } catch (e) {
      if (revision === this.shareRevision) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  copy() {
    if (this.data.share?.publicDomainConfigured)
      wx.setClipboardData({ data: this.data.share.url });
  },
  onShareAppMessage() {
    return {
      title: this.data.title || "豆播创作作品",
      path: this.data.share?.path || "/pages/templates/index",
    };
  },
});
