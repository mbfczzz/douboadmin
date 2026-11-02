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
  shareRevision: 0,
  destroyed: false,
  onLoad(o: Record<string, string>) {
    this.id = o.id;
  },
  onShow() {
    enterPage(this);
    void this.load();
  },
  onUnload() {
    this.revision++;
    this.shareRevision++;
    this.destroyed = true;
  },
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
      if (job.deleted || job.reviewStatus !== "approved") {
        this.shareRevision++;
        this.setData({ share: null });
      }
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
  prompt(e: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    this.shareRevision++;
    this.setData({ showPrompt: e.detail.value, share: null });
  },
  async prepare() {
    if (
      this.data.busy ||
      this.destroyed ||
      !this.data.job ||
      this.data.job.deleted ||
      this.data.job.reviewStatus !== "approved"
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
