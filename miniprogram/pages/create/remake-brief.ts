import type { RemakeSource, Swap } from "../../services/hot-import";
import type { Breakdown } from "../../services/hot-breakdown";

// The chat model's brief for 一键复刻 (after Clipcat's replicate): the video
// model's breakdown of the original when there is one, else its caption,
// rewritten as a time-coded description for the reference video, with the
// user's own pictures standing in for the original product or person.
const second = (n: number) => Math.round(n * 10) / 10;

// "把【主角（长发女生）】换成@图片1中的人物；…": each picture names what it replaces.
export function swapText(swaps: Swap[]) {
  const what = (s: Swap) => (s.kind === "person" ? "人物" : s.kind === "product" ? "商品" : "主体");
  return swaps.map((s) => `把【${s.name}${s.look ? "（" + s.look + "）" : ""}】换成${s.ref}中的${what(s)}`).join("；");
}

function shotsText(b: Breakdown) {
  return b.shots
    .map((s) => `${second(s.start)}–${second(s.end)}秒｜场景：${s.scene}｜动作：${s.action}｜镜头：${s.camera}${s.speech ? "｜台词/字幕：" + s.speech : ""}`)
    .join("\n");
}

function originalText(source: RemakeSource) {
  const b = source.breakdown;
  const length = `约 ${Math.round(source.duration) || "未知"} 秒`;
  if (!b) {
    const caption = Array.from(source.text || source.title).slice(0, 600).join("");
    return `标题：${source.title}\n文案：${caption}\n时长：${length}`;
  }
  const lines = [
    `标题：${source.title}（${length}）`,
    b.summary && `内容：${b.summary}`,
    b.hook && `开头钩子：${b.hook}`,
    b.structure && `结构：${b.structure}`,
    b.sellingPoints.length ? `卖点/情绪点：${b.sellingPoints.join("、")}` : "",
    b.style && `画面风格：${b.style}`,
    b.music && `音乐：${b.music}`,
    `分镜：\n${shotsText(b)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function remakeInstruction(source: RemakeSource, seconds: number, limit: number) {
  const images = source.images || 0;
  const refs = Array.from({ length: images }, (_, i) => "@图片" + (i + 1)).join("、");
  const swap = source.swaps?.length
    ? `用户指定了替换：${swapText(source.swaps)}，外观以图片为准，动作和镜头保持原样；其他主体保持原视频的样子（不要照搬原作者的人物形象和品牌标识）。`
    : refs
      ? `用户提供了 ${refs}：把原视频里的商品或人物换成这些图片中的商品或人物，外观以图片为准，动作和镜头保持原样；描述中用 ${refs} 指代它们。`
      : "主体与原视频同类，但不要照搬原作者的人物形象和品牌标识。";
  const from = source.breakdown ? "下面是视频理解模型对原视频的拆解" : "下面是原视频的文案信息（未能拆解画面，请据此合理推断）";
  return `你是短视频复刻编剧。参考视频已作为 @视频1 提供。${from}：\n${originalText(source)}\n\n请写一段可直接用于 AI 视频生成的复刻描述，生成时长为 ${seconds} 秒：
1. 保留原视频的开头钩子、结构、节奏和卖点；原视频比 ${seconds} 秒长时，合并或精简镜头，开头钩子必须保留在前 3 秒。
2. 按时间分段书写，格式如「0–3秒：…」，每段写清场景、人物动作（按先后顺序）、景别与运镜；台词或口播用引号写出。
3. ${swap}
4. 用 @视频1 指代参考视频，说明参考它的镜头与节奏。
不超过 ${limit} 字。只输出描述本身，不要标题和解释。`;
}

// The remake description built straight from the breakdown, with no chat
// model (no extra charge or wait), for 生成同款 on the task page: the
// original's shots squeezed into the generated length, hook first.
export function remakePrompt(source: RemakeSource, seconds: number, limit: number) {
  const images = source.images || 0;
  const refs = Array.from({ length: images }, (_, i) => "@图片" + (i + 1)).join("、");
  const swap = source.swaps?.length
    ? `。替换：${swapText(source.swaps)}，外观以图片为准，其他主体保持原样`
    : refs ? `，并把原视频中的商品或人物换成${refs}中的商品或人物，外观以图片为准` : "";
  const b = source.breakdown;
  if (!b || !b.shots.length) return cut(`参考@视频1的画面内容、镜头运动和节奏，复刻一条同款视频${swap}。视频主题：${source.title}`, limit);
  const length = source.duration > 0 ? source.duration : b.shots[b.shots.length - 1].end;
  const scale = length > seconds ? seconds / length : 1;
  // Squeezed into a short length, shots that land in the same seconds merge.
  const beats: { from: number; to: number; text: string }[] = [];
  for (const s of b.shots.slice(0, 8)) {
    const from = Math.min(seconds - 1, Math.round(s.start * scale));
    const to = Math.max(from + 1, Math.min(seconds, Math.round(s.end * scale)));
    const text = [s.scene, s.action, s.camera].filter(Boolean).join("，") + (s.speech ? `，台词“${s.speech}”` : "");
    const last = beats[beats.length - 1];
    if (last && from < last.to) {
      last.to = Math.max(last.to, to);
      last.text += "；" + text;
    } else beats.push({ from, to, text });
  }
  const lines = beats.map((beat) => `${beat.from}–${beat.to}秒：${beat.text}`);
  const head = [
    `参考@视频1的画面结构、镜头运动和节奏，复刻一条 ${seconds} 秒的同款视频${swap}。`,
    b.hook && `开头 3 秒保留钩子：${b.hook}。`,
    b.style && `画面风格：${b.style}。`,
  ].filter(Boolean).join("");
  return cut(head + "\n" + lines.join("\n"), limit);
}

function cut(text: string, limit: number) {
  const chars = Array.from(text);
  return chars.length > limit ? chars.slice(0, limit).join("") : text;
}
