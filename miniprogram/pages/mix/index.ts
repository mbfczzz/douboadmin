import { loadConfig } from "../../utils/config-cache";
import { request, error, tab, openPage, openTab } from "../../utils/api";
import type { Row, Asset, Input, Config } from "../../services/types";
import {
  restoreEditorAssets,
  clearEditorAssets,
} from "../../utils/editor-assets";
import { mixState } from "./state";
import { addAssets, uploadMusic, restoreMusic } from "./assets";

Page({
  data: mixState,
  assetRevision: 0,
  restoreIds: [] as string[],
  revision: 0,
  visible: true,
  destroyed: false,
  onShow() {
    this.visible = true;
    tab(this, 1);
    void this.load();
    const added = wx.getStorageSync("mix-add-asset") as Row<Asset>;
    if (added) {
      wx.removeStorageSync("mix-add-asset");
      if (
        this.data.assets.length < 10 &&
        !this.data.assets.some((a: Row<Asset>) => a.id === added.id)
      )
        this.setData({
          assets: [
            ...this.data.assets,
            { ...added, isImage: added.data.type.startsWith("image/") },
          ],
        });
      const text = wx.getStorageSync("mix-source-text");
      wx.removeStorageSync("mix-source-text");
      if (text && !this.data.script) this.setData({ script: text });
    }
    const draft = wx.getStorageSync("mix-draft") as Input;
    if (draft) {
      wx.removeStorageSync("mix-draft");
      this.setData({
        script: draft.prompt,
        ratio: draft.ratio,
        resolution: draft.resolution,
        duration: draft.duration,
        style: draft.style || "clean",
        ...(draft.mix || {}),
        selectedVoice: draft.mix?.voice || "",
        musicVolume: Math.round((draft.mix?.musicVolume ?? 0.2) * 100),
      });
      void this.restoreAssets(draft.assets);
    }
  },
  create() {
    openTab(this, "/pages/create/index");
  },
  onHide() {
    this.visible = false;
    this.revision++;
  },
  onUnload() {
    this.destroyed = true;
    this.visible = false;
    this.assetRevision++;
    this.revision++;
  },
  async load() {
    const version = ++this.revision;
    try {
      const config = await loadConfig();
      if (version !== this.revision || !this.visible || this.destroyed) return;
      this.setData({
        config: {
          enabled: config.mixAvailable,
          message: config.mixMessage || "混剪功能暂未开放",
        },
        transcribe: false,
        rewrite: false,
        narration: false,
        captions: false,
        on: { transcribe: false, rewrite: false, narration: false, captions: false },
        loadError: "",
      });
      void restoreMusic(this, version);
    } catch (e) {
      if (version === this.revision && this.visible && !this.destroyed)
        this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.revision && this.visible && !this.destroyed)
        this.setData({ loading: false });
    }
  },
  async restoreAssets(ids: string[]) {
    await restoreEditorAssets(this, ids, (id) =>
      request<Row<Asset>>("/assets/" + id),
    );
  },
  retryAssets() {
    void this.restoreAssets(this.restoreIds);
  },
  clearAssets() {
    clearEditorAssets(this);
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ script: e.detail.value });
  },
  option(e: WechatMiniprogram.TouchEvent) {
    this.setData({
      [e.currentTarget.dataset.field]: e.currentTarget.dataset.value,
    });
  },
  // Settings are local and always adjustable; only actions that need the
  // mix service (adding files, uploading music, starting) say it is not open.
  toggle(e: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    this.setFeature(e.currentTarget.dataset.field, e.detail.value);
  },
  flip(e: WechatMiniprogram.TouchEvent) {
    const field = e.currentTarget.dataset.field as string;
    this.setFeature(field, !(this.data as Record<string, unknown>)[field]);
  },
  setFeature(field: string, on: boolean) {
    this.setData({ [field]: on, on: { ...this.data.on, [field]: on } });
    if (field === "narration" && on) this.setData({ keepOriginalAudio: false });
  },
  closed() {
    if (this.data.config?.enabled) return false;
    error(new Error(this.data.config?.message || "混剪功能暂未开放"));
    return true;
  },
  duration(e: { detail: { value: number | string } }) {
    this.setData({ duration: Number(e.detail.value) });
  },
  volume(e: WechatMiniprogram.SliderChange) {
    this.setData({ musicVolume: e.detail.value });
  },
  model(e: WechatMiniprogram.PickerChange) {
    this.setData({ modelIndex: Number(e.detail.value) });
  },
  voice(e: WechatMiniprogram.PickerChange) {
    this.setData({ voiceIndex: Number(e.detail.value) });
  },
  chooseMusic() {
    this.setData({ musicIndex: 0, musicId: "", musicLabel: "不使用背景音乐" });
  },
  async add() {
    if (!this.closed()) await addAssets(this);
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading) return;
    this.setData({
      assets: this.data.assets.filter(
        (a: Row<Asset>) => a.id !== e.currentTarget.dataset.id,
      ),
    });
  },
  async uploadMusic() {
    if (!this.closed()) await uploadMusic(this);
  },
  hot() {
    openPage(this, { url: "/pages/hot-videos/index" });
  },
  async generate() {
    error(new Error(this.data.config?.message || "混剪功能暂未开放"));
  },
});
