import { fetchBreakdown, rerunBreakdown, usableBreakdown } from "../../services/hot-breakdown";
import { chooseReferenceFile, upload, media, cancelled, error } from "../../utils/api";
import type { Breakdown, BreakdownSubject } from "../../services/hot-breakdown";
import type { Swap } from "../../services/hot-import";
import type { Job } from "../../services/types";
import { assetViews } from "./assets";

const MAX_PICTURES = 3;
type AssetView = ReturnType<typeof assetViews>[number];

// 一键复刻 with the user's own pictures: the breakdown lists the original's
// subjects (主角、商品…); each one gets its own picture slot — upload there
// to replace that subject, × to keep it as it is (原样) — so the description
// says exactly what replaces what instead of leaving the model to guess.
// Pictures given on older remake pages are a first guess (people and
// products first, in order).
export type SwapRow = BreakdownSubject & { pick: string }; // pick: picture asset id, "" = keep

type Page = {
  data: {
    job: Job | null;
    swaps: SwapRow[];
    swapUrls: Record<string, string>;
    swapUploading: number;
    swapLoaded: boolean;
    rebreaking: boolean;
    genericUploading: boolean;
    busy: boolean;
    assets: AssetView[];
  };
  destroyed: boolean;
  breakdown?: Breakdown | null;
  setData(data: Record<string, unknown>): void;
};

export function firstGuess(subjects: BreakdownSubject[], pictures: string[]): SwapRow[] {
  const left = [...pictures];
  // People and products take pictures first, in the order the video lists them.
  const order = [...subjects.keys()].sort((a, b) => Number(subjects[a].kind === "other") - Number(subjects[b].kind === "other"));
  const rows = subjects.map((s) => ({ ...s, pick: "" }));
  for (const i of order) if (left.length && subjects[i].kind !== "other") rows[i].pick = left.shift()!;
  return rows;
}

// The person in most shots (subjects come in that order) kept while others
// are swapped: the remake would look much like the original, so say so.
export function mainKept(rows: SwapRow[]) {
  const main = rows.find((r) => r.kind === "person");
  return main && !main.pick && rows.some((r) => r.pick) ? main.name : "";
}

// The swaps to write and the pictures to send, numbered @图片1… in that order.
export function chosenSwaps(rows: SwapRow[]): { swaps: Swap[]; pictures: string[] } {
  const pictures: string[] = [];
  const swaps: Swap[] = [];
  for (const r of rows) {
    if (!r.pick) continue;
    if (!pictures.includes(r.pick)) pictures.push(r.pick);
    swaps.push({ name: r.name, kind: r.kind, look: r.look, ref: "@图片" + (pictures.indexOf(r.pick) + 1) });
  }
  return { swaps, pictures };
}

// The breakdown's subjects, matched to the pictures (those given with the
// remake, or all shown when it is broken down again).
function showSwaps(page: Page, breakdown: Breakdown | null, given?: string[]) {
  page.breakdown = breakdown;
  const urls: Record<string, string> = {};
  for (const a of page.data.assets) if (a.isImage) urls[a.id] = a.data.url;
  const pictures = (given || Object.keys(urls)).filter((id) => urls[id]);
  const rows = breakdown?.subjects?.length ? firstGuess(breakdown.subjects, pictures) : [];
  const missing = !breakdown?.shots?.length;
  page.setData({ swapLoaded: true, breakdownUnread: false, breakdownMissing: missing, breakdownStale: !missing && !usableBreakdown(breakdown), swapUrls: urls, swaps: rows, mainKept: mainKept(rows) });
}

export const swapHandlers = {
  // Once the remake is ready: its subjects, matched to the user's pictures.
  async loadSwaps(this: Page) {
    const job = this.data.job;
    if (!job || job.input.purpose !== "remake" || job.status !== "succeeded" || this.breakdown !== undefined) return;
    this.breakdown = null; // loading (once)
    try {
      const breakdown = await fetchBreakdown(job.input.sourceId || "");
      if (!this.destroyed) showSwaps(this, breakdown, job.input.assets || []);
    } catch {
      // Not read (network): said as such, with 重新读取; 生成同款 still
      // works, the server reads the breakdown itself.
      this.breakdown = undefined;
      if (!this.destroyed) this.setData({ swapLoaded: true, breakdownUnread: true, breakdownMissing: false, swaps: [], mainKept: "" });
    }
  },
  reloadSwaps(this: Page) {
    if (this.data.busy || this.data.rebreaking) return;
    this.setData({ swapLoaded: false, breakdownUnread: false });
    void swapHandlers.loadSwaps.call(this);
  },
  // Without a breakdown 生成同款 has only the title to go on: run it again.
  async retryBreakdown(this: Page) {
    const job = this.data.job;
    if (!job?.resultAssetId || this.data.rebreaking || this.data.busy) return;
    this.setData({ rebreaking: true });
    try {
      const breakdown = await rerunBreakdown(job.input.sourceId || "", job.resultAssetId, () => !this.destroyed);
      if (this.destroyed) return;
      if (!breakdown) throw new Error("原视频还是没有拆解成功，可稍后再试");
      showSwaps(this, breakdown);
      if (!usableBreakdown(breakdown)) error(new Error("重新拆解完成，但仍没认出可替换的人物或商品"));
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ rebreaking: false });
    }
  },
  async addGenericPicture(this: Page) {
    const pictures = this.data.assets.filter((a) => a.isImage);
    if (this.data.genericUploading || this.data.busy || pictures.length >= MAX_PICTURES) return;
    this.setData({ genericUploading: true });
    try {
      const file = await chooseReferenceFile("image");
      const row = await upload(file.path);
      if (this.destroyed) return;
      const assets = [...this.data.assets, ...assetViews([row])];
      this.setData({ assets, swapUrls: { ...this.data.swapUrls, [row.id]: media(row.data.url) } });
    } catch (e) {
      if (!cancelled(e) && !this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ genericUploading: false });
    }
  },
  removeGenericPicture(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.genericUploading) return;
    const id = String(e.currentTarget.dataset.id || "");
    this.setData({ assets: this.data.assets.filter((a) => a.id !== id) });
  },
  // The subject's slot: pick a picture from the phone; it replaces this subject.
  async uploadSwap(this: Page, e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.busy || this.data.swapUploading >= 0 || !this.data.swaps[index]) return;
    this.setData({ swapUploading: index });
    try {
      const file = await chooseReferenceFile("image");
      const row = await upload(file.path);
      if (this.destroyed) return;
      const rows = this.data.swaps.map((r, i) => (i === index ? { ...r, pick: row.id } : r));
      const assets = [...this.data.assets, ...assetViews([row])];
      this.setData({ assets, swaps: rows, mainKept: mainKept(rows), swapUrls: { ...this.data.swapUrls, [row.id]: media(row.data.url) } });
    } catch (err) {
      if (!this.destroyed && !cancelled(err)) error(err);
    } finally {
      if (!this.destroyed) this.setData({ swapUploading: -1 });
    }
  },
  // × on the slot: the subject stays as in the original.
  clearSwap(this: Page, e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.busy) return;
    const rows = this.data.swaps.map((r, i) => (i === index ? { ...r, pick: "" } : r));
    this.setData({ swaps: rows, mainKept: mainKept(rows) });
  },
};
