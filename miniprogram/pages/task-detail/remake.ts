import { openPage, openTask, error, submitInput } from "../../utils/api";
import { loadConfig } from "../../utils/config-cache";
import { rememberRows } from "../../utils/view-cache";
import { readBreakdown } from "../../services/hot-breakdown";
import { remakeHandoff, remakeOriginal } from "../../services/hot-import";
import { modelChoices, modelSettings } from "../create/models";
import { referenceSettings, creationMode } from "../create/references";
import { remakePrompt } from "../create/remake-brief";
import type { Job, Row, Asset } from "../../services/types";
import type { Breakdown } from "../../services/hot-breakdown";
import { chosenSwaps } from "./swap";
import type { SwapRow } from "./swap";

// A finished 一键复刻 task (original saved and broken down) goes straight to
// generation: 生成同款 picks a model that takes the reference video (and the
// pictures), the length closest to the original, writes the description from
// the breakdown, and asks once for the points. 调整后再生成 opens the editor.
type Page = {
  data: { job: (Job & { status: string }) | null; busy: boolean; swaps: SwapRow[] };
  breakdown?: Breakdown | null;
  destroyed: boolean;
  visible: boolean;
  setData(data: Record<string, unknown>): void;
};

const ready = (page: Page) => {
  const job = page.data.job;
  return job && !page.data.busy && job.status === "succeeded" && job.resultAssetId ? job : null;
};

// With subjects matched on the page, only the chosen pictures go, in the
// order the swaps name them; without (an older breakdown, none listed) all
// pictures go with the general instruction.
function pictureSwaps(job: Job, rows: SwapRow[]) {
  return rows.length ? chosenSwaps(rows) : { swaps: [], pictures: job.input.assets || [] };
}

async function remakeInput(job: Job, swapRows: SwapRow[], known?: Breakdown | null) {
  const [breakdown, config] = await Promise.all([known !== undefined && known !== null ? known : readBreakdown(job.input.sourceId || ""), loadConfig()]);
  const { swaps, pictures } = pictureSwaps(job, swapRows);
  const assets = [job.resultAssetId!, ...pictures];
  const models = modelChoices(config.models, "video");
  const fits = (m: (typeof models)[number]) => referenceSettings(m).allowVideo && (!pictures.length || referenceSettings(m).allowImage);
  const model = models.find(fits) || models.find((m) => referenceSettings(m).allowVideo);
  if (!model) throw new Error("暂无支持参考视频的模型，无法生成同款");
  const original = remakeOriginal(job);
  const rows = assets.map((id) => ({ id }) as Row<Asset>);
  const s = modelSettings(model, { resolution: "", ratio: "9:16", duration: Math.round(original.duration) || 5, assets: rows });
  return {
    kind: "video",
    feature: "remake",
    model: model.id,
    resolution: s.resolution,
    ratio: s.ratio,
    duration: s.duration,
    quality: s.quality,
    mode: creationMode(model, rows),
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
      const created = await submitInput(await remakeInput(job, this.data.swaps, this.breakdown), "remake"); // shows the points first
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
      remakeHandoff(job, breakdown, pictureSwaps(job, this.data.swaps));
      openPage(this, { url: "/pages/create/index?feature=remake" });
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
};
