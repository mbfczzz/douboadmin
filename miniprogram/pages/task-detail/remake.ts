import { openPage, openTask, error, submitInput } from "../../utils/api";
import { loadConfig } from "../../utils/config-cache";
import { rememberRows } from "../../utils/view-cache";
import { readBreakdown } from "../../services/hot-breakdown";
import { remakeBrief, remakeHandoff, remakeOriginal } from "../../services/hot-import";
import { modelChoices, modelSettings } from "../create/models";
import { referenceError, creationMode } from "../create/references";
import type { Job, Row, Asset } from "../../services/types";
import type { Breakdown } from "../../services/hot-breakdown";
import { RequestError } from "../../services/errors";
import { chosenSwaps } from "./swap";
import { referenceClip, lengthProblem } from "../../services/reference-clip";
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
    rebreaking: boolean;
    swapLoaded: boolean;
  };
  breakdown?: Breakdown | null; // the subjects' (swap.ts)
  shape?: Shape; // the original's size, once the video has loaded
  destroyed: boolean;
  visible: boolean;
  setData(data: Record<string, unknown>): void;
};

const ready = (page: Page) => {
  const job = page.data.job;
  // (the subjects first: without them the pictures would go unassigned)
  return job && page.data.swapLoaded && !page.data.busy && !page.data.rebreaking && !page.data.loadingAssets && page.data.swapUploading < 0 && !page.data.genericUploading && job.status === "succeeded" && job.resultAssetId ? job : null;
};

function pictureSwaps(job: Job, rows: SwapRow[], assets: AssetView[]) {
  const pictures = assets.filter((a) => a.isImage).map((a) => a.id);
  return rows.length ? chosenSwaps(rows) : { swaps: [], pictures: pictures.length ? pictures : job.input.assets || [] };
}

type Shape = { width: number; height: number };
const STANDARD_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"];

// The ratio nearest the original's shape, so a landscape original is not
// cropped to portrait (9:16 until the video has loaded).
export function nearestRatio(ratios: string[], shape?: Shape) {
  const fixed = ratios.filter((r) => /^\d+:\d+$/.test(r));
  if (!fixed.length) return "9:16";
  const want = shape?.width && shape.height ? shape.width / shape.height : 9 / 16;
  const gap = (r: string) => {
    const [w, h] = r.split(":").map(Number);
    return Math.abs(Math.log(w / h / want));
  };
  return fixed.reduce((best, r) => (gap(r) < gap(best) ? r : best));
}

// The video models that can take the original video (the 生成同款 choices).
const ORIGINAL = { id: "original", data: { type: "video/mp4", size: 0 } } as Row<Asset>;
const remakeModels = (config: Config) => modelChoices(config.models, "video").filter((m) => !referenceError(m, [ORIGINAL], true));

// The server writes the description from the task's breakdown.
async function remakeInput(job: Job, swapRows: SwapRow[], pictureAssets: AssetView[], chosen: string, shape?: Shape) {
  const config = await loadConfig();
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
  const tooLong = lengthProblem(original.duration, model, config.models);
  if (tooLong) throw new Error(tooLong);
  const s = modelSettings(model, { resolution: "", ratio: nearestRatio(model.ratios, shape), duration: Math.round(original.duration) || 5, assets: references });
  // The original goes without its sound; the server writes the description meanwhile.
  const [clip, brief] = await Promise.all([
    referenceClip(job.resultAssetId!, model),
    // A model listing no lengths still has the original's (within 60 s) to write for.
    remakeBrief(job.id, s.duration || Math.min(60, Math.round(original.duration) || 5), Math.min(s.maxPromptChars, 2000), pictures.length, swaps),
  ]);
  // The original's shape as the server read it from the file, else as the player reported it.
  const ratio = nearestRatio(model.ratios, brief.width && brief.height ? brief : shape);
  return {
    kind: "video",
    feature: "remake",
    model: model.id,
    resolution: s.resolution,
    ratio: model.ratios.includes(ratio) ? ratio : s.ratio,
    duration: s.duration,
    quality: s.quality,
    mode: creationMode(model, references),
    prompt: brief.prompt,
    assets: [clip, ...pictures],
  };
}

export const remakeHandlers = {
  videoShape(this: Page, e: WechatMiniprogram.CustomEvent<Shape>) {
    if (e.detail.width && e.detail.height) this.shape = { width: e.detail.width, height: e.detail.height };
  },
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
  // A preparation that failed starts over from the remake page (an uploaded
  // video, "u" + asset id, is chosen there again).
  remakeAgain(this: Page) {
    const id = this.data.job?.input.sourceId;
    if (id) openPage(this, { url: id.startsWith("u") ? "/pages/remake/index" : "/pages/remake/index?id=" + id });
  },
  async generateRemake(this: Page) {
    const job = ready(this);
    if (!job) return;
    this.setData({ busy: true });
    try {
      const created = await submitInput(await remakeInput(job, this.data.swaps, this.data.assets, this.data.remakeModel, this.shape), "remake"); // shows the points first
      rememberRows([created]);
      if (!this.destroyed) openTask(created.id, this);
    } catch (e) {
      if (this.destroyed) return;
      error(e); // a declined charge stays silent
      // The breakdown changed since the subjects were read: read them again.
      if (e instanceof RequestError && e.status === 409) {
        this.breakdown = undefined;
        this.setData({ swapLoaded: false });
        void (this as unknown as { loadSwaps(): Promise<void> }).loadSwaps();
      }
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
      remakeHandoff(job, breakdown, pictureSwaps(job, this.data.swaps, this.data.assets), nearestRatio(STANDARD_RATIOS, this.shape));
      openPage(this, { url: "/pages/create/index?feature=remake" });
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
};
