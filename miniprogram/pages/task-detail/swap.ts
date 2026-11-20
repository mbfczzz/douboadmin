import { readBreakdown } from "../../services/hot-breakdown";
import type { Breakdown, BreakdownSubject } from "../../services/hot-breakdown";
import type { Swap } from "../../services/hot-import";
import type { Job } from "../../services/types";

// 一键复刻 with the user's own pictures: the breakdown lists the original's
// subjects (主角、商品…) and each one is matched to a picture or kept as it
// is, so the description says exactly what replaces what instead of leaving
// the video model to guess. A first guess pairs pictures with people and
// products in order; the user changes it on the task page.
export type SwapRow = BreakdownSubject & { pick: string }; // pick: picture asset id, "" = keep

type Page = {
  data: { job: Job | null; swaps: SwapRow[] };
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
    const pictures = job.input.assets || [];
    if (pictures.length && breakdown?.subjects?.length) this.setData({ swaps: firstGuess(breakdown.subjects, pictures) });
  },
  // Tapping a picture on a subject uses it there; tapping it again (or 原样) keeps the original.
  pickSwap(this: Page, e: WechatMiniprogram.TouchEvent) {
    const { index, id } = e.currentTarget.dataset as { index: number; id: string };
    const rows = this.data.swaps.map((r, i) => (i === Number(index) ? { ...r, pick: r.pick === id ? "" : id || "" } : r));
    this.setData({ swaps: rows });
  },
};
