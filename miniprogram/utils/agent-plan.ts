import type { Row, Asset, Plan, PlanView } from "../services/types";
export type { Plan, PlanView } from "../services/types";

// A reply ends with a ```plan JSON block (core.agentContract). The text
// before it is shown as the reply; the plan becomes a card that generates.

const fence = /```plan\s*([\s\S]*?)```/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export const planMeta = (p: Plan) => [p.kind === "image" ? "图片" : "视频", p.kind === "video" ? p.duration + " 秒" : "", p.ratio].filter(Boolean).join(" · ");

export function splitReply(text: string): { text: string; plan?: PlanView } {
  const m = fence.exec(text);
  if (!m) return { text };
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  try {
    const v = JSON.parse(m[1]) as Record<string, unknown>;
    const prompt = str(v.prompt, 4000);
    if (!prompt) return { text: rest };
    const shots = (Array.isArray(v.shots) ? v.shots : []).slice(0, 8).map((s: Record<string, unknown>) => ({
      time: str(s.time, 12), scene: str(s.scene, 200), asset: str(s.asset, 8), line: str(s.line, 120),
    }));
    const kind = v.kind === "image" ? "image" : "video";
    const plan: Plan = { kind, title: str(v.title, 20) || "创作方案", duration: Math.round(Number(v.duration)) || 15, ratio: str(v.ratio, 6) || "9:16", prompt, shots };
    return { text: rest, plan: { ...plan, meta: planMeta(plan) } };
  } catch {
    return { text: rest }; // a broken block is dropped rather than shown as code
  }
}

// "图片2" → the project's second picture (numbered per type, in order).
export function materialFor(name: string, assets: Row<Asset>[]) {
  const m = /^(图片|视频)(\d+)$/.exec(name);
  if (!m) return undefined;
  const type = m[1] === "图片" ? "image/" : "video/";
  return assets.filter((a) => a.data.type.startsWith(type))[Number(m[2]) - 1];
}

