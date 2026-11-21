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

async function remakeInput(job: Job, swapRows: SwapRow[], pictureAssets: AssetView[], known?: Breakdown | null) {
  const [breakdown, config] = await Promise.all([known !== undefined && known !== null ? known : readBreakdown(job.input.sourceId || ""), loadConfig()]);
  const { swaps, pictures } = pictureSwaps(job, swapRows, pictureAssets);
  const assets = [job.resultAssetId!, ...pictures];
  const models = modelChoices(config.models, "video");
  const references = [
    { id: job.resultAssetId!, data: { type: "video/mp4", size: 0 } } as Row<Asset>,
    ...pictures.map((id) => pictureAssets.find((a) => a.id === id) || ({ id, data: { type: "image/jpeg", size: 0 } } as Row<Asset>)),
  ] as Row<Asset>[];
  const model = models.find((m) => !referenceError(m, references, true));
  if (!model) throw new Error(pictures.length ? "暂无同时支持原视频和这些图片的模型，请减少图片或联系管理员" : "暂无支持参考视频的模型，无法生成同款");
  const original = remakeOriginal(job);
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
      const created = await submitInput(await remakeInput(job, this.data.swaps, this.data.assets, this.breakdown), "remake"); // shows the points first
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
