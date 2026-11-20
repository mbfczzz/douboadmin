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

export async function readBreakdown(videoId: string): Promise<Breakdown | null> {
  try {
    const reply = await request<{ status: string; result: Breakdown | null }>("/hot/videos/" + videoId + "/breakdown");
    return reply.status === "done" ? reply.result : null;
  } catch {
    return null;
  }
}
