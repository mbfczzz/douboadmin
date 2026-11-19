import { keepImages, recallRow, rememberRows } from "../../utils/view-cache";
import { saveResults, previewResults } from "./results";
import { ask } from "../../services/dialog";
import {
  request,
  error,
  jobView,
  uid,
  enterPage,
  openTab,
  hasSession,
  login,
  openPage,
} from "../../utils/api";
import type { Job, Row, Asset } from "../../services/types";
import { confirmBudget } from "../../services/business";
import { assetViews } from "./assets";
Page({
  data: {
    job: null as ReturnType<typeof jobView> | null,
    loading: true,
    loadError: "",
    busy: false,
    assets: [] as ReturnType<typeof assetViews>,
    needsLogin: false,
    signingIn: false,
    assetError: "",
    loadingAssets: false,
    autoplay: false,
    promptOpen: false, // long prompts start folded to five lines
  },
  id: "",
  timer: 0,
  fetching: false,
  retryKey: "",
  retryApproval: undefined as number | undefined,
  destroyed: false,
  visible: true,
  onLoad(o: Record<string, string>) {
    this.id = o.id;
    // Opened from the queue or works list: show that row now, then refresh.
    const known = recallRow<ReturnType<typeof jobView>>(o.id);
    if (known) this.setData({ job: jobView(known), loading: false });
    // The key is only stored once a retry is attempted, so opening task
    // details does not leave storage entries behind.
    this.retryKey = wx.getStorageSync("retry-" + this.id) || uid();
    const approval = wx.getStorageSync("retry-approval-" + this.id);
    if (typeof approval === "number") this.retryApproval = approval;
  },
  onShow() {
    this.visible = true;
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
    this.visible = false;
    clearInterval(this.timer);
  },
  onUnload() {
    this.visible = false;
    this.destroyed = true;
    clearInterval(this.timer);
  },
  requireLogin() {
    clearInterval(this.timer);
    this.setData({ needsLogin: true, loading: false, loadError: "", job: null, assets: [], assetError: "" });
  },
  async load() {
    if (!hasSession()) return this.requireLogin();
    if (this.fetching) return;
    this.fetching = true;
    try {
      const j = await request<Job>("/jobs/" + this.id);
      if (this.destroyed) return;
      const final = (status?: string) => status === "succeeded" || status === "failed";
      const wasFinal = final(this.data.job?.status);
      const [job] = keepImages(this.data.job ? [this.data.job] : [], [jobView(j)]);
      rememberRows([job]); // 分享 opens with these same links
      this.setData({
        job, // the result already playing keeps its URL
        loading: false,
        loadError: "",
        needsLogin: false,
      });
      if (final(j.status))
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
      if (!hasSession()) this.requireLogin();
      else this.setData({ loading: false, loadError: (e as Error).message });
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
          assets: assetViews(rows),
        });
    } catch {
      if (!this.destroyed && id === this.id) {
        if (!hasSession()) this.requireLogin();
        else this.setData({ assetError: "参考素材暂时无法加载，点击重试" });
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
  previewAsset(e: WechatMiniprogram.TouchEvent) {
    const assets: ReturnType<typeof assetViews> = this.data.assets;
    const urls = assets.filter((a) => a.isImage).map((a) => a.data.url);
    const current = String(e.currentTarget.dataset.url || "");
    if (urls.includes(current)) wx.previewImage({ urls, current });
  },
  // A reference chip in the prompt: images open the gallery, videos play.
  previewChip(e: WechatMiniprogram.TouchEvent) {
    const assets: ReturnType<typeof assetViews> = this.data.assets;
    const a = assets.find((x) => x.id === e.currentTarget.dataset.id);
    if (a?.isVideo) wx.previewMedia({ sources: [{ url: a.data.url, type: "video", poster: a.data.thumbnailUrl || undefined }], fail() {} });
    else if (a) this.previewAsset({ currentTarget: { dataset: { url: a.data.url } } } as unknown as WechatMiniprogram.TouchEvent);
  },
  togglePrompt() {
    this.setData({ promptOpen: !this.data.promptOpen });
  },
  copyPrompt() {
    const prompt = this.data.job?.input.prompt;
    if (prompt) wx.setClipboardData({ data: prompt, success: () => wx.showToast({ title: "已复制提示词", icon: "none" }) });
  },
  openTemplate() {
    const id = this.data.job?.input.templateId;
    if (id) openPage(this, { url: "/pages/template-detail/index?id=" + encodeURIComponent(id) });
  },
  edit() {
    const input = this.data.job?.input;
    if (!input) return;
    if (input.templateId && !input.prompt)
      return openPage(this, { url: "/pages/template-detail/index?id=" + encodeURIComponent(input.templateId) });
    const mix = input.kind === "mix";
    wx.setStorageSync(mix ? "mix-draft" : "edit-draft", input);
    openTab(this, mix ? "/pages/mix/index" : "/pages/create/index");
  },
  continueCreate() {
    openTab(
      this,
      this.data.job?.input.kind === "mix"
        ? "/pages/mix/index"
        : "/pages/create/index",
    );
  },
  save(e?: WechatMiniprogram.CustomEvent<{ index?: number }>) {
    return saveResults(this, e?.detail?.index);
  },
  preview(e?: WechatMiniprogram.CustomEvent<{ index?: number }>) {
    return previewResults(this, e?.detail?.index || 0);
  },
  share() {
    if (!this.data.job || this.data.job.deleted) return;
    openPage(this, { url: "/pages/share/index?id=" + this.id });
  },
  async remove() {
    if (this.data.busy) return;
    const confirmed = await ask({
      title: "删除这个作品？",
      rows: [{ label: "作品", value: "不再展示" }, { label: "分享链接", value: "失效" }, { label: "订单和积分记录", value: "保留" }],
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
