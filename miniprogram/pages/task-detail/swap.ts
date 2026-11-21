import { readBreakdown } from "../../services/hot-breakdown";
import { chooseReferenceFile, upload, media, cancelled, error } from "../../utils/api";
import type { Breakdown, BreakdownSubject } from "../../services/hot-breakdown";
import type { Swap } from "../../services/hot-import";
import type { Job } from "../../services/types";

// 一键复刻 with the user's own pictures: the breakdown lists the original's
// subjects (主角、商品…); each one gets its own picture slot — upload there
// to replace that subject, × to keep it as it is (原样) — so the description
// says exactly what replaces what instead of leaving the model to guess.
// Pictures given on older remake pages are a first guess (people and
// products first, in order).
export type SwapRow = BreakdownSubject & { pick: string }; // pick: picture asset id, "" = keep

type Page = {
  data: { job: Job | null; swaps: SwapRow[]; swapUrls: Record<string, string>; swapUploading: number; busy: boolean; assets: { id: string; isImage?: boolean; data: { url: string } }[] };
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

export const swapHandlers = {
  // Once the remake is ready: its subjects, matched to the user's pictures.
  async loadSwaps(this: Page) {
    const job = this.data.job;
    if (!job || job.input.purpose !== "remake" || job.status !== "succeeded" || this.breakdown !== undefined) return;
    this.breakdown = null; // loading (once)
    const breakdown = await readBreakdown(job.input.sourceId || "");
    if (this.destroyed) return;
    this.breakdown = breakdown;
    if (!breakdown?.subjects?.length) return;
    const urls: Record<string, string> = {};
    for (const a of this.data.assets) if (a.isImage) urls[a.id] = a.data.url;
    const pictures = (job.input.assets || []).filter((id) => urls[id]);
    this.setData({ swaps: firstGuess(breakdown.subjects, pictures), swapUrls: urls });
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
      this.setData({ swaps: rows, swapUrls: { ...this.data.swapUrls, [row.id]: media(row.data.url) } });
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
    this.setData({ swaps: this.data.swaps.map((r, i) => (i === index ? { ...r, pick: "" } : r)) });
  },
};
