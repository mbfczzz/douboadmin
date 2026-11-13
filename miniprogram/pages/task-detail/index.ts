import { keepImages, recallRow, freshUrl, noteIssued } from "../../utils/view-cache";
import { ask } from "../../services/dialog";
import {
  request,
  error,
  jobView,
  uid,
  media,
  enterPage,
  openTab,
  hasSession,
  login,
  cancelled,
  saveFailed,
  openPage,
} from "../../utils/api";
import type { Job, Row, Asset } from "../../services/types";
import { confirmBudget } from "../../services/business";
import { track } from "../../services/analytics";
Page({
  data: {
    job: null as ReturnType<typeof jobView> | null,
    loading: true,
    loadError: "",
    busy: false,
    assets: [] as (Row<Asset> & { isImage: boolean })[],
    needsLogin: false,
    signingIn: false,
    assetError: "",
    loadingAssets: false,
    autoplay: false,
  },
  id: "",
  timer: 0,
  fetching: false,
  retryKey: "",
  retryApproval: undefined as number | undefined,
  destroyed: false,
  onLoad(o: Record<string, string>) {
    this.id = o.id;
    // Opened from the queue or works list: show that row now, then refresh.
    const known = recallRow<ReturnType<typeof jobView>>(o.id);
    if (known) this.setData({ job: known, loading: false });
    // The key is only stored once a retry is attempted, so opening task
    // details does not leave storage entries behind.
    this.retryKey = wx.getStorageSync("retry-" + this.id) || uid();
    const approval = wx.getStorageSync("retry-approval-" + this.id);
    if (typeof approval === "number") this.retryApproval = approval;
  },
  onShow() {
    this.setData({ autoplay: !!wx.getStorageSync("autoplay-preference") });
    enterPage(this);
    void this.load();
    this.startPolling();
  },
  startPolling() {
    clearInterval(this.timer);
    if (
      hasSession() &&
      !["succeeded", "failed"].includes(this.data.job?.status || "")
    )
      this.timer = setInterval(() => void this.load(), 3000);
  },
  async signIn() {
    if (this.data.signingIn) return;
    this.setData({ signingIn: true });
    try {
      await login("tasks");
      await this.load();
      this.startPolling();
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ signingIn: false });
    }
  },
  onHide() {
    clearInterval(this.timer);
  },
  onUnload() {
    this.destroyed = true;
    clearInterval(this.timer);
  },
  async load() {
    if (!hasSession()) {
      clearInterval(this.timer);
      this.setData({
        needsLogin: true,
        loading: false,
        loadError: "",
        job: null,
        assets: [],
      });
      return;
    }
    if (this.fetching) return;
    this.fetching = true;
    try {
      const j = await request<Job>("/jobs/" + this.id);
      if (this.destroyed) return;
      const final = (status?: string) => status === "succeeded" || status === "failed";
      const wasFinal = final(this.data.job?.status);
      const [job] = keepImages(this.data.job ? [this.data.job] : [], [jobView(j)]);
      this.setData({
        job, // the result already playing keeps its URL
        loading: false,
        loadError: "",
        needsLogin: false,
      });
      if (j.status === "succeeded" || j.status === "failed")
        clearInterval(this.timer);
      else if (wasFinal) this.startPolling(); // shown as done, but retried since
      if (
        (j.input.assets || []).length &&
        !this.data.assets.length &&
        !this.data.assetError
      )
        await this.loadAssets();
    } catch (e) {
      if (this.destroyed) return;
      if (!hasSession()) {
        clearInterval(this.timer);
        this.setData({
          needsLogin: true,
          loading: false,
          loadError: "",
          job: null,
          assets: [],
        });
      } else this.setData({ loading: false, loadError: (e as Error).message });
    } finally {
      this.fetching = false;
    }
  },
  async loadAssets() {
    if (!this.data.job || this.data.loadingAssets) return;
    const id = this.id;
    this.setData({ loadingAssets: true, assetError: "" });
    try {
      const rows = await Promise.all(
        this.data.job.input.assets.map((assetId: string) =>
          request<Row<Asset>>("/assets/" + assetId),
        ),
      );
      if (!this.destroyed && id === this.id)
        this.setData({
          assets: rows.map((a) => ({
            ...a,
            data: { ...a.data, url: media(a.data.url) },
            isImage: a.data.type.startsWith("image/"),
          })),
        });
    } catch {
      if (!this.destroyed && id === this.id) {
        if (!hasSession()) {
          clearInterval(this.timer);
          this.setData({
            needsLogin: true,
            job: null,
            assets: [],
            assetError: "",
          });
        } else this.setData({ assetError: "参考素材暂时无法加载，点击重试" });
      }
    } finally {
      if (!this.destroyed) this.setData({ loadingAssets: false });
    }
  },
  async retry() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      if (!this.data.job) return;
      if (this.retryApproval === undefined) {
        const approved = await confirmBudget(this.data.job.input);
        this.retryApproval = approved.expectedCostUnits || 0;
        wx.setStorageSync("retry-approval-" + this.id, this.retryApproval);
      }
      wx.setStorageSync("retry-" + this.id, this.retryKey);
      const j = await request<Job>(
        "/jobs/" + this.id + "/retry",
        "POST",
        { expectedCostUnits: this.retryApproval },
        this.retryKey,
      );
      wx.removeStorageSync("retry-" + this.id);
      wx.removeStorageSync("retry-approval-" + this.id);
      wx.redirectTo({ url: "/pages/task-detail/index?id=" + j.id });
    } catch (e) {
      if (
        (e as { status?: number }).status === 409 &&
        (e as Error).message.includes("积分价格")
      ) {
        this.retryApproval = undefined;
        wx.removeStorageSync("retry-approval-" + this.id);
      }
      error(e);
    } finally {
      this.setData({ busy: false });
    }
  },
  edit() {
    if (this.data.job) {
      const mix = this.data.job.input.kind === "mix";
      wx.setStorageSync(mix ? "mix-draft" : "edit-draft", this.data.job.input);
      openTab(this, mix ? "/pages/mix/index" : "/pages/create/index");
    }
  },
  continueCreate() {
    openTab(
      this,
      this.data.job?.input.kind === "mix"
        ? "/pages/mix/index"
        : "/pages/create/index",
    );
  },
  async save() {
    if (this.data.busy || !this.data.job?.result) return;
    this.setData({ busy: true });
    try {
      // A finished task stops refreshing; get a newly signed URL if the one
      // on screen may be close to expiring.
      if (!freshUrl(this.data.job.result)) {
        const fresh = jobView(await request<Job>("/jobs/" + this.id));
        noteIssued(fresh.result, fresh.thumbnailUrl);
        if (!this.destroyed) this.setData({ job: fresh });
      }
      const j = this.data.job!;
      if (!j.result) throw new Error("作品暂时无法下载");
      const f =
        await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>(
          (resolve, reject) =>
            wx.downloadFile({ url: j.result!, success: resolve, fail: reject }),
        );
      if (f.statusCode !== 200) throw new Error("下载失败");
      if (j.input.kind === "image")
        await wx.saveImageToPhotosAlbum({ filePath: f.tempFilePath });
      else await wx.saveVideoToPhotosAlbum({ filePath: f.tempFilePath });
      wx.showToast({ title: "已保存到相册", icon: "success" });
      track("work_saved", "task-detail", j.id);
    } catch (e) {
      if (!cancelled(e)) saveFailed(e);
    } finally {
      this.setData({ busy: false });
    }
  },
  preview() {
    if (this.data.job?.result)
      wx.previewImage({ urls: [this.data.job.result] });
  },
  share() {
    if (!this.data.job || this.data.job.deleted) return;
    openPage(this, { url: "/pages/share/index?id=" + this.id });
  },
  async remove() {
    if (this.data.busy) return;
    const confirmed = await ask({
      title: "删除这个作品？",
      content: "删除后不再展示，分享链接会失效；订单和积分记录会保留。",
      confirmText: "删除",
      tone: "danger",
      icon: "delete",
    });
    if (!confirmed) return;
    this.setData({ busy: true });
    try {
      await request("/works/" + this.id, "DELETE");
      await this.load();
      wx.showToast({ title: "已删除", icon: "success" });
    } catch (e) {
      error(e);
    } finally {
      this.setData({ busy: false });
    }
  },
});
