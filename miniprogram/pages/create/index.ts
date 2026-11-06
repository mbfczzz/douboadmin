import {
  request,
  error,
  tab,
  submitInput,
  openTask,
  openPage,
  isNavigating,
} from "../../utils/api";
import type { Config, Row, Asset, Input } from "../../services/types";
import { creationData } from "./state";
import { openModelMenu } from "./model-menu";
import { modelChoices, modelSettings, resolutionSettings } from "./models";
import type { ModelChoice } from "./models";
import {
  addReference,
  selectedModel,
  referenceError,
  creationMode,
} from "./references";
import {
  restoreEditorAssets,
  clearEditorAssets,
} from "../../utils/editor-assets";
Page({
  data: creationData,
  assetRevision: 0,
  restoreIds: [] as string[],
  modelVersion: 0,
  visible: true,
  destroyed: false,
  onHide() {
    this.visible = false;
    this.closeModels();
  },
  onResize() {
    this.closeModels();
  },

  onShow() {
    this.visible = true;
    tab(this, 2);
    void this.loadModels();
    const draft = wx.getStorageSync("edit-draft") as Input;
    if (draft) {
      wx.removeStorageSync("edit-draft");
      this.setData({
        kind: draft.kind === "image" ? "image" : "video",
        prompt: draft.prompt,
        hasPrompt: !!draft.prompt?.trim(),
        model: draft.model || "",
        quality: draft.quality || "",
        ratio: draft.ratio,
        resolution: draft.resolution,
        duration: draft.duration || 5,
        assets: [],
      });
      void this.loadModels();
      void this.restoreAssets(draft.assets || []);
    }
  },
  onUnload() {
    this.destroyed = true;
    this.visible = false;
    this.assetRevision++;
    this.modelVersion++;
  },
  async restoreAssets(ids: string[]) {
    await restoreEditorAssets(this, ids, (id) =>
      request<Row<Asset>>("/assets/" + id),
    );
    if (!this.destroyed) this.refreshParameters();
  },
  retryAssets() {
    void this.restoreAssets(this.restoreIds);
  },
  clearReferences() {
    clearEditorAssets(this);
    this.refreshParameters();
  },
  refreshParameters() {
    const model = selectedModel(this);
    if (model) this.setData(resolutionSettings(model, this.data));
  },
  async loadModels() {
    const version = ++this.modelVersion;
    this.setData({ modelsLoading: true, modelError: "" });
    try {
      const c = await request<Config>(
        "/config",
        "GET",
        undefined,
        undefined,
        false,
      );
      if (version !== this.modelVersion) return;
      const available = modelChoices(c.models, this.data.kind);
      if (available.length) {
        const m =
          available.find((item) => item.id === this.data.model) || available[0];
        this.setData({
          models: c.models,
          availableModels: available,
          ...modelSettings(m, this.data),
        });
      } else
        this.setData({
          model: "",
          modelName: "暂无可用模型",
          availableModels: [],
          resolutions: [],
          ratios: [],
          durations: [],
          qualities: [],
          allowImage: false,
          allowVideo: false,
          allowAudio: false,
          maxReferences: 0,
          parameterError: "",
          modelError: "当前类型暂无可用模型",
        });
    } catch (e) {
      if (version === this.modelVersion)
        this.setData({ modelError: "模型加载失败，请点击重试" });
    } finally {
      if (version === this.modelVersion) this.setData({ modelsLoading: false });
    }
  },
  mode(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading || this.data.restoring || this.data.busy) return;
    const kind = e.currentTarget.dataset.kind;
    if (kind === this.data.kind) return;
    this.setData({
      kind,
      showModels: false,
      resolution: "",
      ratio: kind === "image" ? "1:1" : "9:16",
    });
    void this.loadModels();
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({
      prompt: e.detail.value,
      hasPrompt: !!e.detail.value.trim(),
    });
  },
  useExample(e?: WechatMiniprogram.TouchEvent) {
    if (this.data.prompt.trim() || this.data.busy) return;
    const prompt =
      e?.currentTarget.dataset.value ||
      this.data.ideas[0] ||
      (this.data.kind === "image"
        ? "一瓶香水放在窗边，阳光穿过瓶身，背景是柔和虚化的绿植，清新的产品摄影。"
        : "一瓶香水放在窗边，暖阳穿过瓶身，镜头缓缓推进，背景绿植柔和虚化。");
    this.setData({ prompt, hasPrompt: true });
  },
  chooseResolution(e: WechatMiniprogram.TouchEvent) {
    if (this.data.modelsLoading) return;
    this.setData({ resolution: e.currentTarget.dataset.value });
  },
  chooseRatio(e: WechatMiniprogram.TouchEvent) {
    if (this.data.modelsLoading) return;
    this.setData({ ratio: e.currentTarget.dataset.value });
  },
  duration(e: WechatMiniprogram.SliderChange) {
    const index = e.detail.value;
    this.setData({
      durationIndex: index,
      duration: this.data.durations[index] || 0,
    });
  },
  chooseQuality(e: WechatMiniprogram.TouchEvent) {
    this.setData({ quality: e.currentTarget.dataset.value });
  },
  showModels() {
    if (
      this.data.modelsLoading ||
      this.data.uploading ||
      this.data.restoring ||
      this.data.busy ||
      !this.data.availableModels.length
    )
      return;
    if (this.data.showModels) this.closeModels();
    else openModelMenu(this);
  },
  closeModels() {
    this.setData({ showModels: false });
  },
  selectModel(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading || this.data.restoring || this.data.busy) return;
    const m = this.data.availableModels.find(
      (m: ModelChoice) => m.id === e.currentTarget.dataset.id,
    );
    if (m)
      this.setData({
        ...modelSettings(m, this.data),
        showModels: false,
      });
  },
  showAssets() {
    if (
      !this.data.modelsLoading &&
      !this.data.modelError &&
      this.data.maxReferences &&
      !this.data.busy &&
      !this.data.uploading &&
      !this.data.restoring
    )
      this.setData({ assetsOpen: true });
  },
  closeAssets() {
    this.setData({ assetsOpen: false });
  },
  toggleExpanded() {
    this.setData({ expanded: !this.data.expanded });
  },
  async addAsset(e?: WechatMiniprogram.TouchEvent) {
    await addReference(this, e?.currentTarget.dataset.kind || "image");
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    this.setData({
      assets: this.data.assets.filter(
        (a: Row<Asset>) => a.id !== e.currentTarget.dataset.id,
      ),
    });
    this.refreshParameters();
  },
  async generate() {
    if (
      this.data.busy ||
      this.data.uploading ||
      this.data.restoring ||
      isNavigating(this)
    )
      return;
    if (this.data.modelsLoading || this.data.modelError || !this.data.model) {
      error(new Error("请先加载并选择可用模型"));
      return;
    }
    if (this.data.restoreError) {
      error(new Error(this.data.restoreError));
      return;
    }
    const model = selectedModel(this);
    if (!model || this.data.parameterError) {
      error(new Error(this.data.parameterError || "请先选择可用模型"));
      return;
    }
    const problem = referenceError(model, this.data.assets, true);
    if (problem) {
      error(new Error(problem));
      return;
    }
    if (Array.from(this.data.prompt).length > this.data.maxPromptChars) {
      error(new Error("此模型最多支持 " + this.data.maxPromptChars + " 字"));
      return;
    }
    if (!this.data.prompt.trim()) {
      error(new Error("先描述你想创作的画面"));
      return;
    }
    this.setData({ busy: true });
    try {
      const d = this.data;
      const j = await submitInput(
        {
          kind: d.kind,
          prompt: d.prompt,
          model: d.model,
          mode: creationMode(model, d.assets),
          resolution: d.resolution,
          quality: d.quality,
          ratio: d.ratio,
          duration: d.kind === "video" ? d.duration : 0,
          assets: d.assets.map((a: Row<Asset>) => a.id),
        },
        "create",
      );
      if (this.visible) openTask(j.id, this);
      else wx.showToast({ title: "任务已加入队列", icon: "success" });
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  queue() {
    openPage(this, { url: "/pages/tasks/index" });
  },
});
