// The parts of a reply worth copying on their own: labelled lines (标题：…,
// 文案：…, 提示词：…), code blocks, hashtags and quoted captions or lines.
// Each becomes a 复制 chip under the reply.
const LABELS = "标题|副标题|文案|口播|台词|旁白|字幕|提示词|prompt|话题|标签|开头|钩子|结尾|广告语|slogan|标语|简介|评论|回复";
const labelled = new RegExp(`^[\\s\\-·•*\\d.、)）]*(?:${LABELS})[^：:\\n]{0,2}[：:]\\s*(.+)$`, "i");
// Paired Chinese quotes only: ASCII " opens and closes alike, so the text
// between two quoted words would be taken for a quote.
const quoted = /“([^”\n]{6,200})”|「([^」\n]{6,200})」|『([^』\n]{6,200})』/g;
const fence = /```[a-zA-Z]*\n?([\s\S]*?)```/g;
const unquote = (s: string) => s.trim().replace(/^[“「『"]+|[”」』"]+$/g, "").trim();
const MAX = 6;

export function keyContent(text: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    s = unquote(s);
    // Prompts and code can be long; copying them whole is the point.
    if (s.length >= 4 && s.length <= 2000 && !out.includes(s) && out.length < MAX) out.push(s);
  };
  fence.lastIndex = 0;
  for (let m = fence.exec(text); m; m = fence.exec(text)) add(m[1]);
  const prose = text.replace(fence, "");
  for (const line of prose.split("\n")) {
    const m = labelled.exec(line);
    if (m) add(m[1]);
  }
  // Hashtags (not colour codes like #FFFFFF).
  const tags = (prose.match(/#[^\s#，,。]{1,20}/g) || []).filter((t) => !/^#[0-9a-f]{3,8}$/i.test(t));
  if (tags.length >= 2) add(Array.from(new Set(tags)).join(" "));
  quoted.lastIndex = 0;
  for (let m = quoted.exec(prose); m; m = quoted.exec(prose)) add(m[1] || m[2] || m[3]);
  return out;
}
