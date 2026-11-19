import { request } from "./request";
import { RequestError } from "./errors";

// 一键复刻's breakdown of the original (hook, shots, selling points) by the
// server's video model. Shared per video; the server works in the background
// and we poll. Any problem (not configured, too large, failed, slow) yields
// null: the remake then goes on from the caption alone.
export type BreakdownShot = { start: number; end: number; scene: string; action: string; camera: string; speech: string };
export type Breakdown = {
  summary: string;
  hook: string;
  structure: string;
  sellingPoints: string[];
  style: string;
  music: string;
  shots: BreakdownShot[];
};
type Reply = { status: "running" | "done" | "failed"; result: Breakdown | null; error: string };

const WAIT_MS = 3000;
const GIVE_UP_MS = 4 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function breakdownVideo(videoId: string, assetId: string, alive: () => boolean): Promise<Breakdown | null> {
  const path = "/hot/videos/" + videoId + "/breakdown";
  try {
    let reply = await request<Reply>(path, "POST", { assetId });
    const started = Date.now();
    while (reply.status === "running" && Date.now() - started < GIVE_UP_MS) {
      await sleep(WAIT_MS);
      if (!alive()) return null;
      reply = await request<Reply>(path);
    }
    return reply.status === "done" ? reply.result : null;
  } catch (e) {
    if (e instanceof RequestError) return null; // not configured, too large, …
    throw e; // network or session problems are the caller's to show
  }
}
