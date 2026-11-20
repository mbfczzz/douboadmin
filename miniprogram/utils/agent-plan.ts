import type { Row, Asset, Plan, PlanView, Shot } from "../services/types";
export type { Plan, PlanView } from "../services/types";

// A reply ends with a ```plan JSON block (core.agentContract). The text
// before it is shown as the reply; the plan becomes a card that generates.
// Models drift from the contract, so this also takes ```json blocks that
// carry a prompt, the last of several blocks, trailing commas, Chinese
// values (视频 / 竖屏 / 15秒 / @图片1), and a reply cut off inside the
// block (reported as broken rather than shown as code).

const fences = /```(plan|json)?\s*\n?([\s\S]*?)```/g;
const str = (v: unknown, n: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, n) : "");
const RATIOS: Record<string, string> = { 竖屏: "9:16", 竖版: "9:16", 横屏: "16:9", 横版: "16:9", 方形: "1:1", 正方形: "1:1" };

export const planMeta = (p: Plan) => [p.kind === "image" ? "图片" : "视频", p.kind === "video" ? p.duration + " 秒" : "", p.ratio].filter(Boolean).join(" · ");

// What 复制 copies: the plan as plain lines, not JSON.
export function planText(p: Plan) {
  const shots = p.shots.map((s) => [s.time, s.scene, s.line && `“${s.line}”`, s.asset && `（${s.asset}）`].filter(Boolean).join(" "));
  return [`【${p.title}】${planMeta(p)}`, ...(shots.length ? shots : [p.prompt])].join("\n");
}

// "@图片 1"、"图片1、图片2" → "图片1" (the first one named).
const assetName = (v: unknown) => {
  const m = /(图片|视频)\s*(\d+)/.exec(str(v, 40));
  return m ? m[1] + m[2] : "";
};
const ratioOf = (v: unknown) => {
  const s = str(v, 8).replace("：", ":");
  return /^\d{1,2}:\d{1,2}$/.test(s) ? s : RATIOS[s] || "9:16";
};

function parsePlan(body: string): PlanView | undefined {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return undefined;
  }
  const prompt = str(v?.prompt, 4000);
  if (!prompt) return undefined;
  const shots: Shot[] = (Array.isArray(v.shots) ? v.shots : []).slice(0, 8).map((s: Record<string, unknown>) => ({
    time: str(s?.time, 12), scene: str(s?.scene, 200), asset: assetName(s?.asset), line: str(s?.line, 120),
  })).filter((s) => s.scene || s.line);
  const kind = v.kind === "image" || v.kind === "图片" ? "image" : "video";
  const duration = Math.min(60, Math.max(1, parseInt(str(v.duration, 8), 10) || 15));
  const plan: Plan = { kind, title: str(v.title, 20) || "创作方案", duration, ratio: ratioOf(v.ratio), prompt, shots };
  return { ...plan, meta: planMeta(plan), lead: shots.find((s) => s.asset)?.asset || "" };
}

export function splitReply(text: string): { text: string; plan?: PlanView; broken?: boolean } {
  const blocks: { start: number; end: number; body: string }[] = [];
  fences.lastIndex = 0;
  for (let m = fences.exec(text); m; m = fences.exec(text)) {
    if (m[1] === "plan" || /"prompt"\s*:/.test(m[2])) blocks.push({ start: m.index, end: m.index + m[0].length, body: m[2] });
  }
  let rest = text;
  for (const b of blocks.slice().reverse()) rest = rest.slice(0, b.start) + rest.slice(b.end); // every plan block leaves the prose
  // Cut off inside an unclosed block (the reply hit its length limit).
  const open = rest.lastIndexOf("```");
  if (open >= 0 && /^```(plan|json)/.test(rest.slice(open)) && (rest.slice(open).match(/```/g) || []).length === 1)
    return { text: rest.slice(0, open).trim(), broken: true };
  const last = blocks[blocks.length - 1];
  if (!last) return { text };
  const plan = parsePlan(last.body);
  return plan ? { text: rest.trim(), plan } : { text: rest.trim(), broken: true };
}

// Reply prose without Markdown marks the chat does not render.
// Tables become "A · B · C" lines, links keep their text and address,
// code keeps its content without fences or backticks.
const tableRule = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm;
export const plainReply = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/```[a-zA-Z]*[ \t]*\n?/g, "")
    .replace(tableRule, "")
    .replace(/^[ \t]*\|(.+?)\|?[ \t]*$/gm, (_, row: string) => row.split("|").map((c) => c.trim()).filter(Boolean).join(" · "))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1（$2）")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*(?:\*{3,}|_{3,})[ \t]*$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "· ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// "图片2" → the project's second picture (numbered per type, in order).
export function materialFor(name: string, assets: Row<Asset>[]) {
  const m = /^(图片|视频)(\d+)$/.exec(name);
  if (!m) return undefined;
  const type = m[1] === "图片" ? "image/" : "video/";
  return assets.filter((a) => a.data.type.startsWith(type))[Number(m[2]) - 1];
}
