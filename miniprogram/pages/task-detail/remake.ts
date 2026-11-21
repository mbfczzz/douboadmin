import { openPage, openTask, error, submitInput } from "../../utils/api";
import { loadConfig } from "../../utils/config-cache";
import { rememberRows } from "../../utils/view-cache";
import { readBreakdown } from "../../services/hot-breakdown";
import { remakeHandoff, remakeOriginal } from "../../services/hot-import";
import { modelChoices, modelSettings } from "../create/models";
import { referenceError, creationMode } from "../create/references";
import { remakePrompt } from "../create/remake-brief";
import type { Job, Row, Asset } from "../../services/types";
import type { Breakdown } from "../../services/hot-breakdown";
import { chosenSwaps } from "./swap";
import { referenceClip } from "../../services/reference-clip";
import { pickerItems, savedModel, saveModel } from "../../utils/model-pick";
import type { Config } from "../../services/types";
import type { SwapRow } from "./swap";

type AssetView = ReturnType<typeof import("./assets").assetViews>[number];
type Page = {
  data: {
    job: (Job & { status: string }) | null;
    busy: boolean;
    swaps: SwapRow[];
    assets: AssetView[];
    loadingAssets: boolean;
    swapUploading: number;
    genericUploading: boolean;
    remakeModel: string;
  };
  breakdown?: Breakdown | null;
  destroyed: boolean;
  visible: boolean;
  setData(data: Record<string, unknown>): void;
};

const ready = (page: Page) => {
  const job = page.data.job;
  return job && !page.data.busy && !page.data.loadingAssets && page.data.swapUploading < 0 && !page.data.genericUploading && job.status === "succeeded" && job.resultAssetId ? job : null;
};

function pictureSwaps(job: Job, rows: SwapRow[], assets: AssetView[]) {
  const pictures = assets.filter((a) => a.isImage).map((a) => a.id);
  return rows.length ? chosenSwaps(rows) : { swaps: [], pictures: pictures.length ? pictures : job.input.assets || [] };
}

// The video models that can take the original video (the 生成同款 choices).
const ORIGINAL = { id: "original", data: { type: "video/mp4", size: 0 } } as Row<Asset>;
const remakeModels = (config: Config) => modelChoices(config.models, "video").filter((m) => !referenceError(m, [ORIGINAL], true));

async function remakeInput(job: Job, swapRows: SwapRow[], pictureAssets: AssetView[], known: Breakdown | null | undefined, chosen: string) {
  const [breakdown, config] = await Promise.all([known !== undefined && known !== null ? known : readBreakdown(job.input.sourceId || ""), loadConfig()]);
  const { swaps, pictures } = pictureSwaps(job, swapRows, pictureAssets);

  const models = modelChoices(config.models, "video");
  const references = [
    { id: job.resultAssetId!, data: { type: "video/mp4", size: 0 } } as Row<Asset>,
    ...pictures.map((id) => pictureAssets.find((a) => a.id === id) || ({ id, data: { type: "image/jpeg", size: 0 } } as Row<Asset>)),
  ] as Row<Asset>[];
  const picked = models.find((m) => m.id === chosen);
  if (picked && referenceError(picked, references, true)) throw new Error(`${picked.name} 不能同时带上原视频和这些图片，请换个模型或少放几张图`);
  const model = picked || models.find((m) => !referenceError(m, references, true));
  if (!model) throw new Error(pictures.length ? "暂无同时支持原视频和这些图片的模型，请减少图片或联系管理员" : "暂无支持参考视频的模型，无法生成同款");
  const original = remakeOriginal(job);
  // The original goes as its first seconds the model takes, without sound.
  const assets = [await referenceClip(job.resultAssetId!, model), ...pictures];
  const s = modelSettings(model, { resolution: "", ratio: "9:16", duration: Math.round(original.duration) || 5, assets: references });
  return {
    kind: "video",
    feature: "remake",
    model: model.id,
    resolution: s.resolution,
    ratio: s.ratio,
    duration: s.duration,
    quality: s.quality,
    mode: creationMode(model, references),
    prompt: remakePrompt({ ...original, breakdown, images: pictures.length, swaps }, s.duration, Math.min(s.maxPromptChars, 2000)),
    assets,
  };
}

export const remakeHandlers = {
  // The models 生成同款 can use, the last one picked first (once the job is ready).
  async loadRemakeModels(this: Page) {
    if (this.data.job?.input.purpose !== "remake" || this.data.job.status !== "succeeded") return;
    const list = remakeModels(await loadConfig());
    if (!this.destroyed) this.setData({ remakeModels: pickerItems(list), remakeModel: savedModel("remake", list)?.id || "" });
  },
  chooseRemakeModel(this: Page, e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    saveModel("remake", e.detail.id);
    this.setData({ remakeModel: e.detail.id });
  },
  // A preparation that failed starts over from the remake page.
  remakeAgain(this: Page) {
    const id = this.data.job?.input.sourceId;
    if (id) openPage(this, { url: "/pages/remake/index?id=" + id });
  },
  async generateRemake(this: Page) {
    const job = ready(this);
    if (!job) return;
    this.setData({ busy: true });
    try {
      const created = await submitInput(await remakeInput(job, this.data.swaps, this.data.assets, this.breakdown, this.data.remakeModel), "remake"); // shows the points first
      rememberRows([created]);
      if (!this.destroyed) openTask(created.id, this);
    } catch (e) {
      if (!this.destroyed) error(e); // a declined charge stays silent
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  async editRemake(this: Page) {
    const job = ready(this);
    if (!job) return;
    this.setData({ busy: true });
    try {
      const breakdown = await readBreakdown(job.input.sourceId || "");
      if (this.destroyed) return;
      remakeHandoff(job, breakdown, pictureSwaps(job, this.data.swaps, this.data.assets));
      openPage(this, { url: "/pages/create/index?feature=remake" });
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
};
