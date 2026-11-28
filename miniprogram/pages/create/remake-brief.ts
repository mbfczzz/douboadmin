import type { RemakeSource, Swap } from "../../services/hot-import";
import type { Breakdown } from "../../services/hot-breakdown";

// The chat model's brief for 一键复刻's editor (调整后再生成): the video
// model's breakdown of the original when there is one, else its caption,
// rewritten as a time-coded description for the reference video, with the
// user's own pictures standing in for the original product or person.
// 生成同款's own description is written by the server (hotvideo RemakePrompt).
const second = (n: number) => Math.round(n * 10) / 10;

// "把【主角（长发女生）】换成@图片1中的人物；…": each picture names what it replaces.
export function swapText(swaps: Swap[]) {
  const what = (s: Swap) => (s.kind === "person" ? "人物" : s.kind === "product" ? "商品" : "主体");
  return swaps.map((s) => `把【${s.name}${s.look ? "（" + s.look + "）" : ""}】换成${s.ref}中的${what(s)}`).join("；");
}

function shotsText(b: Breakdown) {
  return b.shots
    .map((s) => `${second(s.start)}–${second(s.end)}秒｜场景：${s.scene}｜动作：${s.action}｜镜头：${s.camera}${s.speech ? "｜台词/口播：" + s.speech : ""}${s.caption ? "｜画面文字：" + s.caption : ""}`)
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
    ? `用户指定了替换：${swapText(source.swaps)}。按这个结构写：开头写「参考@视频1，保持原视频的画面比例、机位与运镜、构图、动作顺序与速度，保留原场景与光线，不新增特效和镜头」，再写「仅将@视频1中的某人替换为@图片N中的人物」；每个被替换的人写清「人物身份严格匹配@图片N」：保留面部轮廓、五官、发型、肤色和年龄感，转身侧脸也不串回原人物；服装以图片为准（有商品替换时以商品图片为准），全程同一套，不变回原服装；接替原人物全部动作，节奏以@视频1为准；手中道具不消失不变形，双脚贴地不漂浮，不裁掉头脚，光影与原视频融合；图片不作为开场画面，不出现图片背景。原人物只写称呼不写外貌，分镜里被替换的人写成对应图片中的人物，不写“第几套”，结尾再强调全片与图片一致。没有替换的主体可以保留，但不写真实姓名，不照搬原作者的品牌标识。`
    : refs
      ? `用户提供了 ${refs}：把原视频里的商品或人物换成这些图片中的商品或人物，外观以图片为准，动作和镜头保持原样；描述中用 ${refs} 指代它们。`
      : "主体与原视频同类，但不要照搬原作者的人物形象和品牌标识。";
  const from = source.breakdown ? "下面是视频理解模型对原视频的拆解" : "下面是原视频的文案信息（未能拆解画面，请据此合理推断）";
  return `你是短视频复刻编剧。参考视频已作为 @视频1 提供。${from}：\n${originalText(source)}\n\n请写一段可直接用于 AI 视频生成的复刻描述，生成时长为 ${seconds} 秒：
1. 保留原视频的开头钩子、结构、节奏和卖点；原视频比 ${seconds} 秒长时，合并或精简镜头，开头钩子必须保留在前 3 秒。
2. 按时间分段书写，格式如「0–3秒：…」，每段写清场景、人物动作（按先后顺序）、景别与运镜；台词或口播用引号写出。
3. ${swap}
4. 用 @视频1 指代参考视频，说明参考它的镜头与节奏。拆解中的【称呼】写成普通称呼；「画面文字」只作内容参考，不写成台词，画面中不要出现字幕和水印。
一般 800 字左右，镜头多时可以更长，最长 ${limit} 字。只输出描述本身，不要标题和解释。`;
}
