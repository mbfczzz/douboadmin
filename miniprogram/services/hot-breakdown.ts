import { request } from "./request";

// 一键复刻's breakdown of the original (hook, shots, selling points) by the
// server's video model; the remake task produces it. Missing (not configured,
// failed, too large) yields null: the remake then goes on from the caption.
export type BreakdownShot = { start: number; end: number; scene: string; action: string; camera: string; speech: string };
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
    state = await request<BreakdownState>(path);
  }
  return state.status === "done" ? state.result : null;
}

export async function readBreakdown(videoId: string): Promise<Breakdown | null> {
  try {
    const reply = await request<{ status: string; result: Breakdown | null }>("/hot/videos/" + videoId + "/breakdown");
    return reply.status === "done" ? reply.result : null;
  } catch {
    return null;
  }
}
