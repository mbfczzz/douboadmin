import { request } from "./request";
import { RequestError } from "./errors";

// 一键复刻's breakdown of the original (hook, shots, selling points) by the
// server's video model; the remake task produces it. Missing (not configured,
// failed, too large) yields null: the remake then goes on from the caption.
// speech: what someone says; caption: words only shown on screen (newer breakdowns).
export type BreakdownShot = { start: number; end: number; scene: string; action: string; camera: string; speech: string; caption?: string };
// Someone or something the original is about, which the user can swap for
// one of their pictures (kind: person | product | other).
export type BreakdownSubject = { name: string; kind: string; look: string; when: string };
export type Breakdown = {
  subjects?: BreakdownSubject[]; // breakdowns before subjects were listed have none
  summary: string;
  hook: string;
  structure: string;
  sellingPoints: string[];
  style: string;
  music: string;
  shots: BreakdownShot[];
};

type BreakdownState = { status: string; result: Breakdown | null };

// 重新拆解 from the user's saved copy of the original, waiting for it (5
// minutes at most, while the page is open); null when it failed again.
export async function rerunBreakdown(videoId: string, assetId: string, alive: () => boolean): Promise<Breakdown | null> {
  const path = "/hot/videos/" + videoId + "/breakdown";
  let state = await request<BreakdownState>(path, "POST", { assetId });
  for (let i = 0; state.status === "running" && i < 100 && alive(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    state = await request<BreakdownState>(path + "?fresh=1"); // this run, not an older result
  }
  return state.status === "done" ? state.result : null;
}

// The breakdown, null when there is none (never run, failed, not offered);
// a network or server problem throws, so it is not taken for none.
export async function fetchBreakdown(videoId: string): Promise<Breakdown | null> {
  try {
    const reply = await request<BreakdownState>("/hot/videos/" + videoId + "/breakdown");
    return reply.status === "done" ? reply.result : null;
  } catch (e) {
    if (e instanceof RequestError && [400, 404, 503].includes(e.status)) return null;
    throw e;
  }
}

// Usable: subjects found and marked as 【称呼】 in the shots, so swaps reach
// every shot (an older breakdown, or one that found nobody, is worth 重新拆解).
export const usableBreakdown = (b: Breakdown | null) =>
  !!b?.subjects?.length && b.shots.some((s) => (s.scene + s.action).includes("【"));

export async function readBreakdown(videoId: string): Promise<Breakdown | null> {
  return fetchBreakdown(videoId).catch(() => null);
}
