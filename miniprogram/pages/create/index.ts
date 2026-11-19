import { showArt } from "../../utils/ui-art";
import { queue, startTaskCount, stopTaskCount } from "../../services/task-count";
import { loadConfig, peekConfig } from "../../utils/config-cache";
import { request, tab, openTab, sessionToken } from "../../utils/api";
import type { Config, Row, Asset, Input } from "../../services/types";
import { creationData } from "./state";
import { generate } from "./submit";
import { cancelEstimate, updateEstimate } from "./estimate";
import { openModelMenu, measureModelMenu } from "./model-menu";
import { modelChoices, modelSettings, resolutionSettings, defaultPromptChars } from "./models";
import type { ModelChoice } from "./editor-types";
import { addReference, selectedModel } from "./references";
import { chooseMention, promptWithout, clearMentions, cancelMention } from "./mentions";
import { cancelPreview } from "./reference-preview";
import { referenceHandlers } from "./reference-ui";
import {
  restoreEditorAssets,
  clearEditorAssets,
} from "../../utils/editor-assets";
Page({
  data: creationData,
  ...referenceHandlers,
  assetRevision: 0,
  restoreIds: [] as string[],
  modelVersion: 0,
  quoteOwner: "",
  visible: true,
  destroyed: false,
  onHide() {
    stopTaskCount(this);
    this.visible = false;
    cancelMention(this);
    cancelPreview(this);
    this.modelVersion++;
    cancelEstimate(this);
    this.closeModels();
  },
  onResize() {
    this.closeModels();
  },
  onReady() {
    measureModelMenu(this); // so the first open lands in place
  },

  onShow() {
    this.visible = true;
    startTaskCount(this);
    const owner = sessionToken();
    if (owner !== this.quoteOwner) cancelEstimate(this, true);
    this.quoteOwner = owner;
    tab(this, 2);
    const draft = wx.getStorageSync("edit-draft") as Input;
    if (draft) {
      wx.removeStorageSync("edit-draft");
      this.setData({
        kind: draft.kind === "image" ? "image" : "video",
        maxPromptChars: defaultPromptChars(draft.kind),
        prompt: draft.prompt,
        hasPrompt: !!draft.prompt?.trim(),
        model: draft.model || "",
        quality: draft.quality || "",
        qualityChosen: !!draft.quality,
        ratio: draft.ratio,
        resolution: draft.resolution,
        resolutionChosen: !!draft.resolution,
        duration: draft.duration || 5,
        assets: [],
        availableModels: [],
        modelsLoading: true,
      });
      void this.restoreAssets(draft.assets || []);
    }
    void this.loadModels();
    // After loadModels so it shares that /config request.
    showArt(this, (art) => ({ sourceArt: { image: art.srcImage, video: art.srcVideo, audio: art.srcAudio } }));
  },
  onUnload() {
    stopTaskCount(this);
    this.destroyed = true;
    this.visible = false;
    cancelMention(this);
    cancelPreview(this);
    cancelEstimate(this);
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
    cancelMention(this);
    cancelPreview(this);
    const prompt = clearMentions(this.data.prompt);
    this.setData({ prompt, hasPrompt: !!prompt.trim() });
    clearEditorAssets(this);
    this.refreshParameters();
  },
  refreshParameters() {
    const model = selectedModel(this);
    if (model) this.setData(resolutionSettings(model, this.data));
    updateEstimate(this);
  },
  retryEstimate() {
    if (this.data.quoteError) updateEstimate(this, true);
  },
  async loadModels() {
    const version = ++this.modelVersion;
    // Cold start or 视频/图片 switch: paint known models now, refresh after.
    const listed = this.data.availableModels as ModelChoice[];
    const cold = !listed.length && !this.data.resolutionChosen && !this.data.qualityChosen;
    const switched = listed.length > 0 && !listed.some((m) => m.kind === this.data.kind);
    const known = (cold || switched) && peekConfig(10 * 60 * 1000);
    if (known) {
      const first = modelChoices(known.models, this.data.kind);
      const m = first.find((item) => item.id === this.data.model) || first[0];
      if (m) this.setData({ availableModels: first, modelIndex: first.indexOf(m), ...modelSettings(m, this.data) });
    }
    this.setData({
      modelsLoading: !this.data.availableModels.some((m: ModelChoice) => m.kind === this.data.kind),
      modelError: "",
    });
    if (this.data.modelsLoading || switched) updateEstimate(this); // a switch prices the new model at once
    try {
      // Always refresh: a model changed in the admin must show on return.
      const c = await loadConfig(true);
      if (version !== this.modelVersion) return;
      const available = modelChoices(c.models, this.data.kind);
      if (available.length) {
        const m =
          available.find((item) => item.id === this.data.model) || available[0];
        // Unchanged catalog: skip re-sending the model list to the view.
        const same = JSON.stringify(available) === JSON.stringify(this.data.availableModels);
        this.setData({
          ...(same ? {} : { availableModels: available }),
          modelIndex: available.indexOf(m),
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
      if (version === this.modelVersion && !this.destroyed) {
        this.setData({ modelsLoading: false });
        updateEstimate(this, true);
      }
    }
  },
  mode(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading || this.data.restoring || this.data.busy) return;
    const kind = e.currentTarget.dataset.kind;
    if (kind === this.data.kind) return;
    this.setData({
      kind,
      maxPromptChars: defaultPromptChars(kind),
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
    chooseMention(this, e.detail.cursor ?? e.detail.value.length);
  },
  chooseResolution(e: WechatMiniprogram.TouchEvent) {
    if (this.data.modelsLoading || this.data.busy) return;
    this.setData({ resolution: e.currentTarget.dataset.value, resolutionChosen: true });
    updateEstimate(this);
  },
  chooseRatio(e: WechatMiniprogram.TouchEvent) {
    if (this.data.modelsLoading || this.data.busy) return;
    this.setData({ ratio: e.currentTarget.dataset.value });
    updateEstimate(this);
  },
  duration(e: WechatMiniprogram.SliderChange) {
    if (this.data.modelsLoading || this.data.busy) return;
    const index = e.detail.value;
    this.setData({
      durationIndex: index,
      duration: this.data.durations[index] || 0,
    });
    updateEstimate(this);
  },
  chooseQuality(e: WechatMiniprogram.TouchEvent) {
    if (this.data.modelsLoading || this.data.busy) return;
    this.setData({ quality: e.currentTarget.dataset.value, qualityChosen: true });
    updateEstimate(this);
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
  // Failed brand images fall back to the native icon in the menu.
  hideModelIcon(e: WechatMiniprogram.CustomEvent) {
    const { id, url } = e.currentTarget.dataset;
    const index = this.data.availableModels.findIndex((m: ModelChoice) => m.id === id && m.iconURL === url);
    if (this.data.availableModels[index])
      this.setData({
        [`availableModels[${index}].iconURL`]: "",
        [`availableModels[${index}].icon`]: "",
      });
  },
  selectModel(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading || this.data.restoring || this.data.busy) return;
    const m = this.data.availableModels.find(
      (m: ModelChoice) => m.id === e.currentTarget.dataset.id,
    );
    if (m)
      this.setData({
        ...modelSettings(m, this.data),
        modelIndex: this.data.availableModels.indexOf(m),
        showModels: false,
      });
    updateEstimate(this);
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
    const bar = wx.getWindowInfo().statusBarHeight || 24;
    this.setData({ expanded: !this.data.expanded, expandedTop: bar + 52 });
  },
  async addAsset(e?: WechatMiniprogram.TouchEvent) {
    await addReference(this, e?.currentTarget.dataset.kind || "image");
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    this.removeAsset(e.currentTarget.dataset.id);
  },
  removeAsset(id: string) {
    const prompt = promptWithout(this.data.prompt, this.data.assets, id);
    this.setData({
      prompt,
      hasPrompt: !!prompt.trim(),
      assets: this.data.assets.filter((a: Row<Asset>) => a.id !== id),
    });
    this.refreshParameters();
  },
  async generate() {
    await generate(this);
  },
  queue,
  // Resolution, duration, aspect ratio and quality live in a sheet.
  openParams() {
    if (!this.data.modelsLoading) this.setData({ paramsOpen: true });
  },
  closeParams() {
    this.setData({ paramsOpen: false });
  },
  templates() {
    openTab(this, "/pages/templates/index");
  },
});
