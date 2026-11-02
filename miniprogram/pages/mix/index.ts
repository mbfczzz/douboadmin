import {
  request,
  error,
  tab,
  submitInput,
  openTask,
  openPage,
  isNavigating,
} from "../../utils/api";
import type { Row, Asset, Input } from "../../services/types";
import {
  restoreEditorAssets,
  clearEditorAssets,
} from "../../utils/editor-assets";
import { mixState } from "./state";
import type { MixConfig, Music } from "./state";
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
  onHide() {
    this.visible = false;
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
      const [config, music] = await Promise.all([
        request<MixConfig>("/mix/config", "GET", undefined, undefined, false),
        request<Row<Music>[]>("/music", "GET", undefined, undefined, false),
      ]);
      if (version !== this.revision) return;
      const index = Math.max(
        0,
        config.voiceModels.findIndex(
          (v) => v.id === (this.data.ttsModel || config.ttsModel),
        ),
      );
      const selected = config.voiceModels[index];
      this.setData({
        config,
        music,
        musicNames: ["不使用背景音乐", ...music.map((r) => r.data.title)],
        modelNames: config.voiceModels.map((m) => m.name),
        modelIndex: index,
        ttsModel: selected?.id || "",
        voices: selected?.voices || [],
        voiceIndex: Math.max(
          0,
          (selected?.voices || []).indexOf(this.data.selectedVoice),
        ),
        loadError: "",
      });
      void restoreMusic(this, version);
    } catch (e) {
      if (version === this.revision)
        this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
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
  toggle(e: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
    if (field === "narration" && e.detail.value)
      this.setData({ keepOriginalAudio: false });
  },
  duration(e: WechatMiniprogram.Input) {
    this.setData({ duration: Number(e.detail.value) });
  },
  volume(e: WechatMiniprogram.SliderChange) {
    this.setData({ musicVolume: e.detail.value });
  },
  model(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value),
      m = this.data.config?.voiceModels[index];
    if (m)
      this.setData({
        modelIndex: index,
        ttsModel: m.id,
        voices: m.voices || [],
        voiceIndex: 0,
        selectedVoice: m.voices?.[0] || "",
      });
  },
  voice(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    this.setData({
      voiceIndex: index,
      selectedVoice: this.data.voices[index] || "",
    });
  },
  chooseMusic(e: WechatMiniprogram.PickerChange) {
    const i = Number(e.detail.value);
    this.setData({
      musicIndex: i,
      musicId: i ? this.data.music[i - 1].id : "",
      musicLabel: this.data.musicNames[i],
    });
  },
  async add() {
    await addAssets(this);
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
    await uploadMusic(this);
  },
  hot() {
    openPage(this, { url: "/pages/hot-videos/index" });
  },
  async generate() {
    if (
      this.data.busy ||
      this.data.uploading ||
      this.data.restoring ||
      isNavigating(this)
    )
      return;
    const d = this.data;
    if (!d.config?.enabled) {
      error(new Error("混剪引擎尚未配置"));
      return;
    }
    if (!d.assets.length) {
      error(new Error("先添加图片或视频素材"));
      return;
    }
    if (d.restoreError) {
      error(new Error(d.restoreError));
      return;
    }
    this.setData({ busy: true });
    try {
      const job = await submitInput(
        {
          kind: "mix",
          model: "local-mix",
          prompt: d.script,
          assets: d.assets.map((a: Row<Asset>) => a.id),
          ratio: d.ratio,
          resolution: d.resolution,
          duration: d.duration,
          style: d.style,
          mix: {
            autoScenes: d.autoScenes,
            transcribe: d.transcribe,
            rewrite: d.rewrite,
            narration: d.narration,
            voice: d.voices[d.voiceIndex] || "",
            ttsModel: d.ttsModel,
            rewriteModel: d.config.rewriteModel,
            captions: d.captions,
            musicId: d.musicId,
            musicVolume: d.musicVolume / 100,
            keepOriginalAudio: d.keepOriginalAudio,
          },
        },
        "mix",
      );
      if (this.visible) openTask(job.id, this);
      else wx.showToast({ title: "混剪任务已加入队列", icon: "none" });
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
});
